/**
 * 授权断言套件：**以不同身份真的去调**，看该拒的有没有被拒。
 *
 * 补的是 `audit-anon-exposure.mjs` 的另一半。那个脚本问的是"匿名能碰到什么"（走线上 PostgREST），
 * 而这里问的是"**登录用户 A 能不能碰到 B 的数据**" —— 这一半没法用 PostgREST 测：
 * 手上只有 publishable key，拿不到任意用户的密码去签 JWT。所以走 SSH 直连库，
 * 用 `set_config('request.jwt.claims', ...)` 伪造身份 + `SET LOCAL ROLE authenticated` 让 RLS 真正生效
 * （超级用户是**绕过 RLS** 的，不切角色等于什么都没测）。
 *
 * 为什么值得单独一个脚本：Section 105 刚给 16 个函数补了身份守卫，Section 101 收回了匿名执行权，
 * 而这两件事**都只被一次性探针验过**。探针跑完就没了，回归没有人守。
 *
 * 只读：全部是 SELECT 与"应当抛错"的调用，且在同一个事务里跑完 ROLLBACK，不留任何数据。
 *
 * 一个实现上的坑：切到 `authenticated` 之后**写不了**自己建的临时表（没那个权限），
 * 所以跑测期间结果先攒在 plpgsql 数组里，`RESET ROLE` 之后再落表。
 *
 * 用法：npm run audit:authz        （需要 ~/.ssh/config 里的 hk-sb，可用 DSH_SUPABASE_SSH 覆盖）
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SSH_HOST = process.env.DSH_SUPABASE_SSH ?? 'hk-sb'

const SQL = String.raw`
\pset pager off
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE authz_results (name TEXT, ok BOOLEAN, detail TEXT) ON COMMIT DROP;

DO $authz$
DECLARE
  v_me UUID;
  v_other UUID;
  v_admin UUID;
  v_cnt INT;
  v_ok BOOLEAN;
  v_blocked INT;
  v_allowed INT;
  v_n INT;
  v_ambiguous INT := 0;
  v_seen INT;
  v_anon_extra INT;
  v_fn RECORD;
  -- 结果先攒这里：切到 authenticated 之后写不了上面那张临时表
  v_lines TEXT[] := ARRAY[]::TEXT[];
BEGIN
  SELECT id INTO v_me    FROM public.profiles WHERE role IS DISTINCT FROM 'admin' ORDER BY id LIMIT 1;
  SELECT id INTO v_other FROM public.profiles WHERE role IS DISTINCT FROM 'admin' AND id <> v_me ORDER BY id LIMIT 1;
  SELECT id INTO v_admin FROM public.profiles WHERE role = 'admin' ORDER BY id LIMIT 1;

  v_lines := v_lines || format('%s|样本：至少一个非管理员用户|%s',
    (v_me IS NOT NULL)::text, coalesce(v_me::text, 'profiles 里没有非管理员，断言无法进行'));
  IF v_me IS NULL THEN
    INSERT INTO authz_results SELECT split_part(l,'|',2), split_part(l,'|',1)::boolean, split_part(l,'|',3) FROM unnest(v_lines) l;
    RETURN;
  END IF;
  v_lines := v_lines || format('%s|样本：第二个非管理员（越权测试的靶子）|%s',
    (v_other IS NOT NULL)::text, coalesce(v_other::text, '只有一个人，改用随机 uuid（守卫本就该在查库前拒绝）'));
  v_lines := v_lines || format('%s|样本：管理员|%s',
    (v_admin IS NOT NULL)::text, coalesce(v_admin::text, '没有管理员账号，A3 会跳过'));
  IF v_other IS NULL THEN v_other := gen_random_uuid(); END IF;

  -- ══════════ A. Section 105 的身份守卫 ══════════
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- 按**每个函数真实的签名**构造调用：p_user_id 传靶子，其余参数一律 NULL。
  -- 不能图省事统一按 (uuid, text[]) 调 —— 那会让签名不符的函数报"函数不存在"（42883），
  -- 被 WHEN OTHERS 吞掉之后看起来像"过了"，实际根本没调到（我第一版就是这么写的）。
  -- 参数名/类型从 proargnames 与 proargtypes 取：对于 RETURNS TABLE，
  -- 名字数组里 IN 参数在前、OUT 列在后，所以按下标 1..pronargs 取到的正是 IN 参数。
  v_blocked := 0; v_n := 0;
  FOR v_fn IN
    SELECT p.proname,
           (SELECT string_agg(
                     CASE WHEN a.nm = 'p_user_id' THEN format('%L::uuid', v_other)
                          ELSE format('NULL::%s', a.tp) END,
                     ', ' ORDER BY a.ord)
              FROM (
                SELECT gs AS ord, p2.proargnames[gs] AS nm,
                       format_type(p2.proargtypes[gs - 1], NULL) AS tp
                  FROM generate_series(1, p2.pronargs) gs
              ) a) AS callargs
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
      LEFT JOIN pg_proc p2 ON p2.oid = p.oid
     WHERE ns.nspname = 'public' AND p.prokind = 'f'
       AND position('Section 105 身份守卫' IN p.prosrc) > 0
     ORDER BY p.proname
  LOOP
    v_n := v_n + 1;
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_me::text, 'role', 'authenticated')::text, true);
    IF v_fn.callargs IS NULL THEN
      v_lines := v_lines || format('false|A1 无法为 %s 构造调用参数|proargnames 读不出 p_user_id', v_fn.proname);
      CONTINUE;
    END IF;
    BEGIN
      EXECUTE format('SELECT public.%I(%s)', v_fn.proname, v_fn.callargs);
      v_lines := v_lines || format('false|A1 %s 没有被守卫挡住|传他人 uuid 却调用成功了', v_fn.proname);
    EXCEPTION
      WHEN SQLSTATE '42501' THEN v_blocked := v_blocked + 1;
      WHEN SQLSTATE '42883' THEN
        v_lines := v_lines || format('false|A1 %s 的调用参数构造错了|42883 函数不存在 —— 是测试的锅不是守卫的', v_fn.proname);
      -- 重载 + 默认值会让"少传参数"的调用天然二义（get_subject_progress 就是这样：
      -- 5 参那个的最后一个有 DEFAULT，于是 4 参调用同时匹配两个候选）。这不是守卫的问题，
      -- 是"从 SQL 里按名字调重载函数"这件事本身的边界 —— 如实记成"没测到"，不当失败。
      WHEN SQLSTATE '42725' THEN v_ambiguous := v_ambiguous + 1;
      WHEN OTHERS THEN NULL;   -- 其它错（参数为空、找不到会话…）也不算"被守卫挡住"
    END;
  END LOOP;
  v_lines := v_lines || format('%s|A1 传他人 uuid 必须被 42501 挡住|被挡 %s / %s 个带守卫的函数%s',
    ((v_n > 0 AND v_blocked + v_ambiguous = v_n) AND v_blocked > 0)::text,
    v_blocked, v_n,
    CASE WHEN v_ambiguous > 0 THEN format('（另有 %s 个因重载二义无法唯一解析，未能动态验证）', v_ambiguous) ELSE '' END);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_me::text, 'role', 'authenticated')::text, true);
  v_allowed := 0;
  BEGIN PERFORM public.get_review_count(v_me, ARRAY['x']::text[]); v_allowed := v_allowed + 1; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; WHEN OTHERS THEN v_allowed := v_allowed + 1; END;
  BEGIN PERFORM public.get_type_accuracy(v_me, ARRAY['x']::text[]); v_allowed := v_allowed + 1; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; WHEN OTHERS THEN v_allowed := v_allowed + 1; END;
  BEGIN PERFORM public.get_daily_completion(v_me, 7, ARRAY['x']::text[]); v_allowed := v_allowed + 1; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; WHEN OTHERS THEN v_allowed := v_allowed + 1; END;
  BEGIN PERFORM public.get_accuracy_change(v_me); v_allowed := v_allowed + 1; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; WHEN OTHERS THEN v_allowed := v_allowed + 1; END;
  BEGIN PERFORM public.get_review_pool_count(v_me, '[]'::jsonb); v_allowed := v_allowed + 1; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; WHEN OTHERS THEN v_allowed := v_allowed + 1; END;
  BEGIN PERFORM public.load_practice_session(v_me, 'nope'); v_allowed := v_allowed + 1; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; WHEN OTHERS THEN v_allowed := v_allowed + 1; END;
  BEGIN PERFORM public.get_random_question_id(v_me, ARRAY['x']::text[], NULL, NULL); v_allowed := v_allowed + 1; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; WHEN OTHERS THEN v_allowed := v_allowed + 1; END;
  BEGIN PERFORM public.get_sessions_answered(v_me, '[]'::jsonb); v_allowed := v_allowed + 1; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; WHEN OTHERS THEN v_allowed := v_allowed + 1; END;
  v_lines := v_lines || format('%s|A2 自己调自己必须放行（抽查 8 个）|放行 %s / 8',
    (v_allowed = 8)::text, v_allowed);

  IF v_admin IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
    v_ok := TRUE;
    BEGIN PERFORM public.get_review_count(v_me, ARRAY['x']::text[]);
    EXCEPTION WHEN SQLSTATE '42501' THEN v_ok := FALSE; END;
    v_lines := v_lines || format('%s|A3 管理员可读他人数据|%s', v_ok::text,
      CASE WHEN v_ok THEN '放行' ELSE '被拦了 —— 后台会坏' END);
  END IF;

  -- ══════════ B. RLS 越权 ══════════
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_me::text, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO v_cnt FROM public.user_answers WHERE user_id = v_other AND is_public = FALSE;
  v_lines := v_lines || format('%s|B1 读他人非公开作答 = 0 行|读到 %s 行', (v_cnt = 0)::text, v_cnt);

  SELECT count(*) INTO v_cnt FROM public.exam_sessions WHERE user_id = v_other;
  v_lines := v_lines || format('%s|B2 读他人考试场次 = 0 行|读到 %s 行', (v_cnt = 0)::text, v_cnt);

  -- 反向对照：读自己**不该**恒为 0，否则"越权被挡住"根本无从谈起（全都挡住了）
  SELECT count(*) INTO v_cnt FROM public.profiles WHERE id = v_me;
  v_lines := v_lines || format('%s|B3 反向对照：读自己的 profiles = 1 行|读到 %s 行', (v_cnt = 1)::text, v_cnt);

  -- 以自己身份往别人的 user_id 里写：必须被 RLS 的 WITH CHECK 拒掉
  v_ok := FALSE;
  BEGIN
    INSERT INTO public.user_answers (user_id, question_id, selected_answer, is_correct, mode)
    SELECT v_other, q.id, '0'::jsonb, FALSE, 'practice' FROM public.questions q LIMIT 1;
  EXCEPTION WHEN SQLSTATE '42501' THEN v_ok := TRUE;
            WHEN OTHERS THEN v_ok := FALSE;
  END;
  v_lines := v_lines || format('%s|B4 以自己身份写入他人 user_id 必须被拒|%s',
    v_ok::text, CASE WHEN v_ok THEN '被 RLS 拒了' ELSE '竟然写进去了 —— 严重' END);
  -- 即便它成功了，本次事务最后一定 ROLLBACK，不会留数据

  -- 顺带记一下切换后的实际权限身份，确认这些断言真的是在 authenticated 下跑的
  v_lines := v_lines || format('%s|B5 断言确实以 authenticated 身份执行|current_user=%s role=%s',
    (current_user = 'authenticated')::text, current_user, coalesce(auth.role(), 'null'));

  EXECUTE 'RESET ROLE';

  -- ══════════ C. 匿名权限（catalog 断言，不切身份） ══════════
  SELECT count(*) INTO v_anon_extra
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.prokind = 'f'
     AND has_function_privilege('anon', p.oid, 'EXECUTE')
     AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e')
     AND p.proname NOT IN ('is_admin', 'is_study_room_member', 'is_study_room_owner', 'qr_login_status');
  v_lines := v_lines || format('%s|C1 匿名可调的应用函数只剩白名单那 4 个|白名单之外还有 %s 个',
    (v_anon_extra = 0)::text, v_anon_extra);

  v_ok := NOT has_function_privilege('authenticated', 'public.auth_attempt(uuid,text,int)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.auth_attempt(uuid,text,int)', 'EXECUTE');
  v_lines := v_lines || format('%s|C2 auth_attempt 只有 service_role 能调|%s', v_ok::text,
    CASE WHEN v_ok THEN 'anon/authenticated 都不可调' ELSE '还能被登录用户调 —— 可以刷别人的失败次数' END);

  SELECT count(*) INTO v_seen FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.prokind = 'f' AND NOT p.prosecdef
     AND pg_get_function_arguments(p.oid) LIKE '%p_user_id%'
     AND position('auth.uid()' IN p.prosrc) = 0 AND position('is_admin()' IN p.prosrc) = 0;
  v_lines := v_lines || format('%s|C3 没有漏网的"收 p_user_id 却不校验"的 INVOKER 函数|还剩 %s 个',
    (v_seen = 0)::text, v_seen);

  INSERT INTO authz_results
  SELECT split_part(l, '|', 2), split_part(l, '|', 1)::boolean, split_part(l, '|', 3)
    FROM unnest(v_lines) l;
END $authz$;

\echo
\echo == 授权断言结果 ==
SELECT CASE WHEN ok THEN '  ✓' ELSE '  ✗' END AS r, name, detail FROM authz_results ORDER BY name;

DO $verdict$
DECLARE v_fail INT; v_all INT;
BEGIN
  SELECT count(*) FILTER (WHERE NOT ok), count(*) INTO v_fail, v_all FROM authz_results;
  IF v_fail > 0 THEN
    RAISE EXCEPTION '授权断言有 % / % 条失败', v_fail, v_all;
  END IF;
  RAISE NOTICE '授权断言全部通过：% 条', v_all;
END $verdict$;

ROLLBACK;
`

const work = mkdtempSync(join(tmpdir(), 'audit-authz-'))
try {
  const local = join(work, 'authz.sql')
  writeFileSync(local, SQL)
  execFileSync('scp', ['-q', '-o', 'BatchMode=yes', local, `${SSH_HOST}:/tmp/dsh-audit-authz.sql`], { stdio: ['ignore', 'inherit', 'inherit'] })
  const remote = 'docker exec -i supabase-db psql -U supabase_admin -d postgres -X -q < /tmp/dsh-audit-authz.sql'
  const out = execFileSync('ssh', ['-o', 'BatchMode=yes', SSH_HOST, remote], { encoding: 'utf8' })
  process.stdout.write(out)
  console.log('\n（全程只读：断言在同一个事务里跑完即 ROLLBACK，不留数据）')
} catch (e) {
  const stdout = e && typeof e === 'object' && 'stdout' in e ? String(e.stdout ?? '') : ''
  const stderr = e && typeof e === 'object' && 'stderr' in e ? String(e.stderr ?? '') : ''
  if (stdout) process.stdout.write(stdout)
  const msg = (stderr || (e instanceof Error ? e.message : String(e)))
    .split('\n')
    .filter((l) => l.trim() && !/CategoryInfo|FullyQualifiedErrorId|所在位置|^\s*\+/.test(l))
    .join('\n')
  console.error(`\n授权断言失败（或连不上库）：\n${msg.slice(0, 1200)}`)
  console.error(`\n依赖 ~/.ssh/config 里的 \`${SSH_HOST}\` 别名（可用 DSH_SUPABASE_SSH 覆盖）。`)
  process.exit(1)
} finally {
  rmSync(work, { recursive: true, force: true })
}
