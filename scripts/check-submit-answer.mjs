/**
 * `submit_answer`（migration Section 106）的事务与幂等断言：**对着真库跑一遍，然后回滚**。
 *
 * 为什么需要它：这个函数的全部价值都在"两件事在一个事务里"和"同一个键不会写两行"，
 * 而这两条都**没法在前端测**：
 *   · 幂等靠的是 `user_answers_client_operation_id_key` 这个部分唯一索引 + 函数里的早返回，
 *     只在前端 mock 掉，测到的是我写的 mock，不是库的行为；
 *   · RLS、CHECK、plpgsql 的异常处理都只在真库里成立。
 * 一次性探针验过就没了（Section 106 落地时就是这么验的），回归没人守 —— 所以固化成脚本。
 *
 * 手法与 `audit-authz.mjs` 同一套：SSH 直连库 → `SET LOCAL ROLE authenticated` 让 RLS 真正生效
 * （超级用户绕过 RLS，不切角色等于什么都没测），身份用 `request.jwt.claims` 伪造。
 * `role` 这个 claim 必须一起给：策略里写的是 `role() = 'authenticated'`，只给 `sub` 会一行都看不见。
 *
 * 全程在同一个事务里，结尾 ROLLBACK，不留任何数据。
 * 切到 authenticated 之后写不了临时表，所以结果先攒在 plpgsql 数组里，`RESET ROLE` 之后再落表。
 *
 * 用法：npm run check:submit        （需要 ~/.ssh/config 里的 hk-sb，可用 DSH_SUPABASE_SSH 覆盖）
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

CREATE TEMP TABLE sa_results (name TEXT, ok BOOLEAN, detail TEXT) ON COMMIT DROP;

SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub',  (SELECT id FROM public.profiles ORDER BY created_at LIMIT 1),
    'role', 'authenticated'
  )::text,
  true
);

DO $sa$
DECLARE
  v_uid    UUID := auth.uid();
  v_qid    UUID;
  v_key    UUID := gen_random_uuid();
  v_sess   TEXT := 'sa-' || substr(gen_random_uuid()::text, 1, 8);
  v_a1     UUID;
  v_c1     BOOLEAN;
  v_a2     UUID;
  v_c2     BOOLEAN;
  v_rows   INT;
  v_idx    INT;
  v_pos    JSONB;
  v_owner  UUID;
  v_err    TEXT;
  v_lines  TEXT[] := ARRAY[]::TEXT[];
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';

  IF v_uid IS NULL THEN
    v_lines := v_lines || 'false|前置：能拿到 auth.uid()|伪造的 claims 没生效，以下断言都无意义';
  END IF;

  SELECT id INTO v_qid FROM public.questions LIMIT 1;
  IF v_qid IS NULL THEN
    v_lines := v_lines || 'false|前置：库里有题目|questions 是空的，无法构造作答';
  END IF;

  IF v_uid IS NOT NULL AND v_qid IS NOT NULL THEN
    -- ── ① 幂等键：同一动作重发只写一行 ──
    SELECT answer_id, created INTO v_a1, v_c1
      FROM public.submit_answer(v_qid, '"A"'::jsonb, TRUE, 'practice', 'random', NULL, v_key);
    SELECT answer_id, created INTO v_a2, v_c2
      FROM public.submit_answer(v_qid, '"A"'::jsonb, TRUE, 'practice', 'random', NULL, v_key);
    SELECT count(*) INTO v_rows FROM public.user_answers WHERE client_operation_id = v_key;
    v_lines := v_lines || format('%s|S1 同一个 client_operation_id 重发只写一行|第一次 created=%s 第二次 created=%s，两次是同一个 id=%s，库里 %s 行',
      (v_c1 AND NOT v_c2 AND v_a1 IS NOT DISTINCT FROM v_a2 AND v_rows = 1)::text,
      v_c1, v_c2, (v_a1 IS NOT DISTINCT FROM v_a2), v_rows);

    -- ── ② 不带键：同题反复作答本来就允许，不能被顺手去重 ──
    PERFORM public.submit_answer(v_qid, '"B"'::jsonb, FALSE, 'practice', 'random', NULL, NULL);
    PERFORM public.submit_answer(v_qid, '"B"'::jsonb, FALSE, 'practice', 'random', NULL, NULL);
    SELECT count(*) INTO v_rows FROM public.user_answers
     WHERE user_id = v_uid AND selected_answer = '"B"'::jsonb AND client_operation_id IS NULL;
    v_lines := v_lines || format('%s|S2 不带键时两次作答是两行（没有被误去重）|实际 %s 行',
      (v_rows = 2)::text, v_rows);

    -- ── ③ user_id 由服务端取 auth.uid()，不接受调用方传入 ──
    SELECT user_id INTO v_owner FROM public.user_answers WHERE id = v_a1;
    v_lines := v_lines || format('%s|S3 落库的 user_id 就是 auth.uid()|行里的 user_id=%s，auth.uid()=%s',
      (v_owner = v_uid)::text, v_owner, v_uid);

    -- ── ④ 会话行已存在时，进度与作答同一个事务写进去 ──
    INSERT INTO public.practice_sequential_state (user_id, session_key, current_index, subject_positions)
    VALUES (v_uid, v_sess, 0, '{}'::jsonb);
    PERFORM public.submit_answer(v_qid, '"C"'::jsonb, TRUE, 'practice', 'sequential', NULL,
                                gen_random_uuid(), v_sess, 7, '{"数学": 3}'::jsonb);
    SELECT current_index, subject_positions INTO v_idx, v_pos
      FROM public.practice_sequential_state WHERE user_id = v_uid AND session_key = v_sess;
    v_lines := v_lines || format('%s|S4 顺序模式的进度跟着作答一起写|current_index=%s subject_positions=%s',
      (v_idx = 7 AND v_pos = '{"数学": 3}'::jsonb)::text, v_idx, v_pos);

    -- ── ⑤ 只推进、不新建：会话行不存在时不该造出一行空会话 ──
    PERFORM public.submit_answer(v_qid, '"D"'::jsonb, TRUE, 'practice', 'sequential', NULL,
                                gen_random_uuid(), 'sa-不存在-' || v_sess, 5, NULL);
    SELECT count(*) INTO v_rows FROM public.practice_sequential_state
     WHERE user_id = v_uid AND session_key = 'sa-不存在-' || v_sess;
    v_lines := v_lines || format('%s|S5 会话行不存在时不新建空会话|新建了 %s 行', (v_rows = 0)::text, v_rows);

    -- ── ⑥ 进度参数传 NULL = 不动现值（else 会把进度清零） ──
    PERFORM public.submit_answer(v_qid, '"E"'::jsonb, TRUE, 'practice', 'sequential', NULL,
                                gen_random_uuid(), v_sess, NULL, NULL);
    SELECT current_index INTO v_idx FROM public.practice_sequential_state
     WHERE user_id = v_uid AND session_key = v_sess;
    v_lines := v_lines || format('%s|S6 进度参数传 NULL 时保留原值|current_index 仍是 %s（期望 7）',
      (v_idx = 7)::text, v_idx);

    -- ── ⑦ 函数抛错时不留半成品：非法 mode 违反 CHECK，作答行不该落库 ──
    -- 这一条证的是"失败整体不留痕"（INSERT 那半边）。反方向（进度写失败把作答也带走）
    -- 没有可构造的失败源 —— 进度列没有 CHECK，所以那半边只有"两条 DML 在同一个函数体内"
    -- 这一层静态保证，不在这条断言里。
    v_err := NULL;
    BEGIN
      PERFORM public.submit_answer(v_qid, '"F"'::jsonb, TRUE, 'not-a-mode'::text, 'random', NULL, gen_random_uuid());
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
    END;
    SELECT count(*) INTO v_rows FROM public.user_answers WHERE selected_answer = '"F"'::jsonb AND user_id = v_uid;
    v_lines := v_lines || format('%s|S7 校验失败时不留半成品|抛错=%s，残留作答行 %s 行',
      (v_err IS NOT NULL AND v_rows = 0)::text, v_err IS NOT NULL, v_rows);
  END IF;

  EXECUTE 'RESET ROLE';
  INSERT INTO sa_results
  SELECT split_part(l, '|', 2), split_part(l, '|', 1)::boolean, split_part(l, '|', 3)
    FROM unnest(v_lines) l;
END $sa$;

\echo
\echo == submit_answer 事务与幂等断言 ==
SELECT CASE WHEN ok THEN '  ✓' ELSE '  ✗' END AS r, name, detail FROM sa_results ORDER BY name;

DO $verdict$
DECLARE v_fail INT; v_all INT;
BEGIN
  SELECT count(*) FILTER (WHERE NOT ok), count(*) INTO v_fail, v_all FROM sa_results;
  IF v_fail > 0 THEN
    RAISE EXCEPTION 'submit_answer 断言有 % / % 条失败', v_fail, v_all;
  END IF;
  RAISE NOTICE 'submit_answer 断言全部通过：% 条', v_all;
END $verdict$;

ROLLBACK;
`

const work = mkdtempSync(join(tmpdir(), 'check-submit-'))
try {
  const local = join(work, 'submit.sql')
  writeFileSync(local, SQL)
  execFileSync('scp', ['-q', '-o', 'BatchMode=yes', local, `${SSH_HOST}:/tmp/dsh-check-submit.sql`], { stdio: ['ignore', 'inherit', 'inherit'] })
  const remote = 'docker exec -i supabase-db psql -U supabase_admin -d postgres -X -q < /tmp/dsh-check-submit.sql'
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
  console.error(`\nsubmit_answer 断言失败（或连不上库）：\n${msg.slice(0, 1200)}`)
  console.error(`\n依赖 ~/.ssh/config 里的 \`${SSH_HOST}\` 别名（可用 DSH_SUPABASE_SSH 覆盖）。`)
  process.exit(1)
} finally {
  rmSync(work, { recursive: true, force: true })
}
