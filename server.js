const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const HTML_FILE = path.join(__dirname, "index.html");

const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url.startsWith("/?")) {
    fs.readFile(HTML_FILE, (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end("Missing index.html");
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(data);
    });
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

const wss = new WebSocket.Server({ server });
const rooms = new Map();

function getRoom(id) {
  if (!rooms.has(id)) rooms.set(id, new Set());
  return rooms.get(id);
}

wss.on("connection", ws => {
  ws.room = null;
  ws.role = null;

  ws.on("message", raw => {
    let msg;

    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (!msg.room) return;

    if (msg.type === "join") {
      const room = getRoom(msg.room);

      if (room.size >= 2) {
        ws.send(JSON.stringify({ type: "full" }));
        return;
      }

      ws.room = msg.room;
      ws.role = msg.role || "peer";
      room.add(ws);

      ws.send(JSON.stringify({
        type: "joined",
        room: ws.room,
        role: ws.role
      }));

      for (const peer of room) {
        if (peer !== ws && peer.readyState === WebSocket.OPEN) {
          peer.send(JSON.stringify({
            type: "peer-joined",
            role: ws.role
          }));
        }
      }

      return;
    }

    const room = rooms.get(msg.room);
    if (!room) return;

    for (const peer of room) {
      if (peer !== ws && peer.readyState === WebSocket.OPEN) {
        peer.send(JSON.stringify(msg));
      }
    }
  });

  ws.on("close", () => {
    if (!ws.room) return;

    const room = rooms.get(ws.room);
    if (!room) return;

    room.delete(ws);

    for (const peer of room) {
      if (peer.readyState === WebSocket.OPEN) {
        peer.send(JSON.stringify({ type: "peer-left" }));
      }
    }

    if (room.size === 0) rooms.delete(ws.room);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Pac-Man RTC server running on port ${PORT}`);
});