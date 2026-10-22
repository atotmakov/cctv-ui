# Quickstart: Validate Camera Health Status

## Prerequisites

- Node 22, `npm install` at repo root.
- For the production check: SSH key access to the NAS (see `deploy.ps1` / `.env.deploy`).

## 1. Automated tests

```bash
npm test
```

Expected: all server and client tests pass, including

- rule tests for activity, recency, learning and unknown (see [data-model.md](data-model.md#level-rules));
- the **SC-001 replay** over the 13–19 Oct 2026 fixture: the four cameras that stopped recording reach `critical`
  by 18 Oct 23:00 MSK, the three healthy cameras are `ok` at every hourly instant, every recency threshold is
  ≤ 24 h, and 7–20 Oct shows zero false-alarm days;
- route test: `/api/maintenance/status` returns `health` per camera per
  [contracts/maintenance-status.md](contracts/maintenance-status.md), and one camera with a broken index does not
  fail the response;
- client test: the Health column renders one label per camera with level text and reasons in its tooltip.

## 2. Local run against sample data

```bash
npm run dev
# open http://localhost:5173/maintenance
```

Expected: a **Health** column next to Camera. The sample camera (`video_example/axis-00408CE298CD`) has only old
recordings, so it shows red with a "No recordings for …" reason, or grey if history is too short to judge — either
way the label has text and a tooltip, and the rest of the table is unchanged.

## 3. Production check after deploy

Set `HEALTH_TIMEZONE=Europe/Moscow` on the `cctv-ui` service in `docker-compose.yml`, deploy with `.\deploy.ps1`,
then:

```bash
curl -s http://192.168.1.100:8888/api/maintenance/status | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>JSON.parse(s).cameras.forEach(c=>console.log(c.id, c.health?.level, (c.health?.reasons||[]).join(' | '))))"
```

Expected: every camera has a level; cameras that have not recorded recently are red with a reason; the page at
`http://192.168.1.100:8888/maintenance` loads in under 2 s (browser dev tools → Network).
