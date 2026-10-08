# Backend contract (FastAPI on Raspberry Pi 5)

The PWA consumes these endpoints when `APP.dataSource = 'api'`. Shapes match the mock layer
(`js/services/mockService.js`, `js/services/mockData.js`).

```
Hikvision camera ─RTSP→ Raspberry Pi 5 (YOLO) → feeder state → FastAPI ─REST/WebSocket→ PWA
FastAPI → VFD controller ─RS485 / Modbus RTU→ ABB ACS580
```

## GET /api/v1/live
```json
{
  "timestamp": "2026-10-08T10:42:00Z",
  "connection": { "source": "api", "online": true },
  "crusher": { "status": "RUNNING|STOPPED|WARNING|FAULT", "motorCurrentA": 68.2 },
  "feeder":  { "aiState": "EMPTY|PARTIAL|FULL", "confidence": 92, "detectedAt": "…", "detecting": true },
  "vfd": {
    "requestedMode": "AUTO|MANUAL", "mode": "AUTO|MANUAL",
    "manualHz": 47, "commandHz": 47, "outputHz": 46.8, "autoHz": 43,
    "manualAllowed": true, "atMax": false, "interlock": false, "driveStatus": "Running"
  }
}
```

## WebSocket /ws/live
Messages: `{ "type": "live", "data": <same as /live> }` and `{ "type": "alert", "data": <alert> }`.

## GET /api/v1/vfd/trend?minutes=10
`[{ "t": 1696760000000, "hz": 43.0 }, …]`

## POST /api/v1/feeder/control
Body: `{ "mode": "AUTO" | "MANUAL", "manualHz": 47 }` (either field optional).
Must reject MANUAL unless the current AI state is EMPTY, and reject `manualHz` outside the
configured manual range. Returns 200 on success, 409/422 with `{ "detail": "…" }` otherwise.

## GET /api/v1/alerts?limit=100
`[{ "id", "severity": "fault|warning|info|normal", "type", "title", "description", "time", "read", "source" }]`

## GET /api/v1/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD&label=…
See the object returned by `mockAnalytics()` in `js/services/mockData.js`
(runtime/downtime, `states`, `detections`, `vfd` {avgHz,minHz,maxHz,trend,manualPeriods},
`stopEvents`, `alerts`, `oee`, `days`).

## Settings (future)
`GET/PUT /api/v1/settings` — frequencies (full/partial/empty, manual min/max), company, plant, support.

## Push
`POST /api/v1/push/subscribe` — body is the browser `PushSubscription` JSON.
