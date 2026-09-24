#!/usr/bin/env python3
# Judge0 节点压力测试:按并发阶梯发批量提交,统计延迟分位与吞吐。
# 直接打 localhost:2358(绕开 Cloudflare 与 Edge Function 的限制),量的是节点真实能力。
import json, os, re, statistics, sys, threading, time, urllib.request, urllib.error

BASE = "http://127.0.0.1:2358"
SECRETS = {}
for line in open("/opt/judge0/.secrets"):
    if "=" in line:
        k, v = line.strip().split("=", 1)
        SECRETS[k] = v
TOKEN = SECRETS["AUTHN_TOKEN"]
HEAD = {"Authorization": TOKEN, "Content-Type": "application/json"}

# 贴近真实用法:一次提交 3 个测试点,其中 1 个 C++(要编译,CPU 重) + 2 个 python
PY = "a,b=map(int,input().split())\nprint(a+b)\n"
CPP = '#include <iostream>\nint main(){long a,b;std::cin>>a>>b;std::cout<<a+b<<std::endl;return 0;}\n'
BATCH = [
    {"source_code": PY,  "language_id": 71, "stdin": "1 2\n"},
    {"source_code": PY,  "language_id": 71, "stdin": "10 20\n"},
    {"source_code": CPP, "language_id": 54, "stdin": "100 200\n"},
]

def req(method, path, body=None, timeout=180):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, headers=HEAD, method=method)
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        raw = resp.read().decode()
    return json.loads(raw) if raw.strip() else None

def one_submission():
    """发一批,轮询到全部出结果,返回 (秒, 状态列表)"""
    t0 = time.time()
    created = req("POST", "/submissions/batch?base64_encoded=false", {"submissions": BATCH})
    toks = [c["token"] for c in created]
    while True:
        got = req("GET", f"/submissions/batch?tokens={','.join(toks)}&fields=status,stdout,time,memory")
        subs = got.get("submissions", got) if isinstance(got, dict) else got
        if all((s.get("status") or {}).get("id", 0) >= 3 for s in subs):
            return time.time() - t0, [(s.get("status") or {}).get("id") for s in subs]
        if time.time() - t0 > 170:
            return time.time() - t0, ["TIMEOUT"]
        time.sleep(0.3)

def run_level(conc, n_requests):
    lat, errs = [], 0
    lock = threading.Lock()
    q = list(range(n_requests))
    def worker():
        nonlocal errs
        while True:
            with lock:
                if not q: return
                q.pop()
            try:
                dt, st = one_submission()
                with lock: lat.append((dt, st))
            except Exception:
                with lock: errs += 1
    t0 = time.time()
    ths = [threading.Thread(target=worker) for _ in range(conc)]
    [t.start() for t in ths]
    [t.join() for t in ths]
    wall = time.time() - t0
    if not lat:
        return dict(conc=conc, n=n_requests, wall=wall, errs=errs, p50=None, p95=None, mx=None, thr=0, ok=0)
    ds = sorted(d for d, _ in lat)
    ok = sum(1 for _, st in lat if all(s == 3 for s in st))
    return dict(
        conc=conc, n=n_requests, wall=wall, errs=errs,
        p50=statistics.median(ds), p95=ds[int(len(ds) * 0.95) - 1] if len(ds) > 1 else ds[0],
        mx=ds[-1], thr=n_requests / wall * 60, ok=ok,
    )

print(f"== 单发基线 ==")
b = [one_submission()[0] for _ in range(3)]
print(f"   单次提交(3测试点,含1个C++编译) 平均 {statistics.mean(b):.2f}s  (min {min(b):.2f} / max {max(b):.2f})\n")

print(f"{'并发':>4} {'请求数':>6} {'总耗时':>8} {'吞吐(次/分)':>12} {'p50':>7} {'p95':>7} {'max':>7} {'全通过':>7} {'错误':>5}")
print("-" * 78)
rows = []
for conc, n in [(1, 4), (4, 8), (8, 16), (16, 24), (32, 32)]:
    r = run_level(conc, n)
    rows.append(r)
    print(f"{r['conc']:>4} {r['n']:>6} {r['wall']:>7.1f}s {r['thr']:>11.1f} "
          f"{r['p50']:>6.2f}s {r['p95']:>6.2f}s {r['mx']:>6.2f}s {r['ok']:>7} {r['errs']:>5}")

print("\n注:平台 judge 函数给单次提交的截止时间是 max(20s, cpuMs*测试点数 + 10s),")
print("    所以 p95 超过 ~20s 的并发档,真实平台提交会开始报「判题超时」。")
json.dump(rows, open("/root/stress-result.json", "w"), indent=2)
print("\n结果已存 /root/stress-result.json")
