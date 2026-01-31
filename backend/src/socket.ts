import type http from 'http';
import { Server } from 'socket.io';

let io: Server | null = null;

// Track online users based on explicit identification from the client.
// Key = userId, value = number of active sockets for that user.
const onlineUsers = new Map<string, number>();

export const initSocket = (server: http.Server) => {
  io = new Server(server, {
    cors: {
      origin: 'http://localhost:3000',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    // The client should emit 'identify' with the authenticated user id
    socket.on('identify', (payload: { userId?: string }) => {
      const userId = payload?.userId;
      if (!userId) return;

      // Store userId on the socket instance for disconnect handling
      (socket.data as any).userId = userId;

      const current = onlineUsers.get(userId) ?? 0;
      onlineUsers.set(userId, current + 1);

      if (current === 0) {
        // First active connection for this user
        io?.emit('user:online', { userId });
      }
    });

    socket.on('disconnect', () => {
      const userId = (socket.data as any).userId as string | undefined;
      if (!userId) return;

      const current = onlineUsers.get(userId);
      if (current === undefined) return;

      if (current <= 1) {
        onlineUsers.delete(userId);
        io?.emit('user:offline', { userId });
      } else {
        onlineUsers.set(userId, current - 1);
      }
    });
  });

  console.log('Socket is running');

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io has not been initialized');
  }
  return io;
};

export const getOnlineUserIds = (): string[] => {
  return Array.from(onlineUsers.keys());
};
