---
name: local-judge0-setup
description: Install and run Judge0 CE on the user's own machine (an Ubuntu 22.04 VM in VirtualBox) to power the practice platform's “local self-test”, then judge code test point by test point over its REST API. Use when the user mentions local judging, Judge0, setting up a judge, "status 13", or "local self-test won't connect".
---

# Local Judge0 environment (install + operate)

Coding questions run on the user's own machine and the results are for personal practice only. Two jobs: **stand Judge0 up**, and **judge code test point by test point over its REST API**.

## 0. Hard prerequisite: Linux with cgroup v1

Judge0's `isolate` sandbox needs **cgroup v1**.

- ✅ **Ubuntu 22.04** inside VirtualBox / VMware (the path this project verified)
- ❌ Windows Docker Desktop and WSL2 expose only cgroup v2 — every submission fails with **`status.id = 13`**
- ❌ Same for macOS — do not burn time on it

If the user wants to run it directly on Windows / macOS, tell them this immediately.

## 1. Install VirtualBox + Ubuntu 22.04

1. Install Oracle VirtualBox and download an Ubuntu 22.04 **Server** image (no GUI needed for judging).
2. Create the VM with **≥ 4GB RAM**, **≥ 40GB disk**, **≥ 2 CPUs**.
3. Finish the guided install and note the login credentials.

## 2. Port forwarding: reach the VM at the host's localhost:2358

**With the VM powered off**: Settings → Network → Attached to `NAT` → Advanced → Port Forwarding, add:

```
Protocol TCP    Host Port 2358    Guest Port 2358    Host IP left empty
```

Now `http://localhost:2358` on the host reaches Judge0 inside the VM.

## 3. Boot and force cgroup v1 (skip this and you get status 13)

In the Ubuntu terminal (sudo required):

```bash
sudo nano /etc/default/grub
# set GRUB_CMDLINE_LINUX to the line below (even if it was empty before):
GRUB_CMDLINE_LINUX="systemd.unified_cgroup_hierarchy=0"
sudo update-grub
sudo reboot
ls /sys/fs/cgroup/memory   # lists entries = cgroup v1 active, continue
```

**Checkpoint**: `ls /sys/fs/cgroup/memory` must list entries. If it is empty or missing, fix cgroup before going further.

## 4. Install Docker in Ubuntu and start Judge0

Copy the repo's `judge0/` folder into the VM (or `git clone` the user's repo), then:

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2
cd judge0
docker compose up -d
curl http://localhost:2358/config_info   # JSON response inside the VM = success
```

`judge0/docker-compose.yml` brings up five services: `server`, `workers`, `db` (postgres:16.2), `redis`, and `proxy` (nginx:1.27-alpine, exposing 2358). `nginx.conf` already adds the CORS and `Access-Control-Allow-Private-Network` headers, so browsers can reach it from an HTTPS page with **no browser flags**.

Day-to-day operations:

```bash
docker compose ps                 # are all five containers up?
docker compose logs -f workers    # worker issues
docker compose restart            # after editing judge0.conf
docker compose down               # stop (no -v: keeps data)
```

## 5. Verify from the host machine

```bash
# Windows / macOS / Linux host
curl -s http://localhost:2358/config_info
```

A JSON response means it works. Then have the user hit “Re-check” on the platform's “Local Judge” page until it turns green, open any coding question, and enable “local self-test” at the top of the editor.

## 6. Judge code over REST (one submission per test point)

Each Judge0 submission is a full compile + run, which maps naturally onto one OJ test point. **Create one submission per test point**, then poll them in a batch and compare.

```bash
# (1) list language ids (common values below; confirm with GET /languages)
curl -s http://localhost:2358/languages

# (2) batch create — one submission per test point
curl -s -X POST "http://localhost:2358/submissions/batch?base64_encoded=false" \
  -H "Content-Type: application/json" \
  -d '{"submissions":[
        {"source_code":"print(int(input())+1)","language_id":71,"stdin":"1","cpu_time_limit":2,"memory_limit":131072},
        {"source_code":"print(int(input())+1)","language_id":71,"stdin":"41","cpu_time_limit":2,"memory_limit":131072}
      ]}'
# returns one token per submission

# (3) poll for results (leave ~400ms between rounds; do not hammer the service)
curl -s "http://localhost:2358/submissions/batch?tokens=<t1>,<t2>&fields=token,stdout,stderr,compile_output,status,time,memory"
```

Units matter: `cpu_time_limit` is in **seconds**, `memory_limit` is in **KB**. This project clamps custom values to `cpu_time_limit ≤ 15s` and `memory_limit ≤ 512000KB`, and deliberately does **not** send `wall_time_limit` / `stack_size_limit` — the server answers 422 if you do.

### Language ids (Judge0 CE 1.13 built-in table)

| Language | key | language_id |
| --- | --- | --- |
| C (GCC 7.4.0) | `c` | 50 |
| C++ (GCC 7.4.0) | `cpp` | 54 |
| Java (OpenJDK 13.0.1) | `java` | 62 |
| JavaScript (Node.js 12.14.0) | `javascript` | 63 |
| TypeScript (3.7.4) | `typescript` | 74 |
| Python (3.8.1) | `python` | 71 |

### Status ids (`GET /statuses`)

| id | Meaning | Verdict |
| --- | --- | --- |
| 1 / 2 | In Queue / Processing | Not done — keep polling |
| 3 | Accepted | Ran fine, **still compare stdout** |
| 4 | Wrong Answer | Output mismatch |
| 5 | Time Limit Exceeded | Too slow |
| 6 | Compilation Error | Read `compile_output` |
| 7–12 | Runtime Error (per signal) | Read `stderr` |
| 13 | Internal Error | Almost always cgroup v2 — go back to step 3 |

**A test point passes only when `status.id == 3` AND `stdout` matches the expected output.** When comparing, ignore trailing whitespace and trailing blank lines (this project strips `/\s+$/` first). Question banks often store a literal `\n` instead of a real newline — decode those before submitting, or the stdin arrives with a literal backslash and the program errors out.

## 7. Boundaries (must follow)

- Local results are **untrusted** and for practice only: no leaderboards, no public scores, no exams, no contests.
- **Only claim “Accepted / passed” when every test point really passes.** If the judge is unreachable, say “not verified locally” — **never fake a pass**.
- Local self-test and the platform's central judge are separate paths; anything affecting official scores is decided by the central judge.
- Never edit test points, expected outputs, or stdout to make a result look better.

## 8. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Every submission returns `status.id = 13` | cgroup v2 (Windows Docker Desktop / WSL2, or grub not changed) | Go back to step 3, or use the VirtualBox Ubuntu path |
| Host `curl localhost:2358` gets nothing | Port forwarding missing / VM off / service down | Check the NAT rule, the VM state, then `docker compose ps` |
| Browser blocks with CORS or `Private Network Access` | The repo's proxy is not in use | Use the repo's `judge0/docker-compose.yml` (nginx adds the headers) |
| Submission returns 422 | Parameter over the server limit | `cpu_time_limit ≤ 15` (s), `memory_limit ≤ 512000` (KB); do not send wall/stack limits |
| Results stay at id 1 / 2 | Workers not running | `docker compose ps`, then `docker compose logs workers` |
| A language reports “not found” | Wrong `language_id` | Confirm with `GET /languages` |
| Platform “Re-check” stays red | It probes `http://localhost:2358/config_info` | Make that curl succeed on the host first, then retry on the platform |
