import http from 'node:http';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { GameRoom } from './GameRoom';

const port = Number(process.env.PORT ?? 2567);

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    'content-type': 'text/plain',
    'access-control-allow-origin': '*',
  });
  res.end('Mountain Defense server up');
});

const gameServer = new Server({
  transport: new WebSocketTransport({ server }),
});

gameServer.define('game', GameRoom);

gameServer.listen(port).then(() => {
  console.log(`Mountain Defense server listening on ws://localhost:${port}`);
});
