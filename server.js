const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");

const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

// Banco de dados falso em memória
let users = {}; // users[discordId] = socket.id
let userData = {}; // userData[discordId] = { username, avatar }
let friends = {}; // friends[discordId] = [lista de IDs de amigos]

io.on('connection', (socket) => {
  console.log('Novo usuário conectado:', socket.id);

  socket.on('registrar', (user) => {
    users[user.id] = socket.id;
    userData[user.id] = user;
    if(!friends[user.id]) friends[user.id] = [];
    
    // Manda a lista de amigos preenchida
    const listaAmigos = friends[user.id].map(amigoId => ({
        discordId: amigoId,
        username: userData[amigoId]?.username || "Desconhecido",
        avatar: userData[amigoId]?.avatar
    }));
    socket.emit('carregar-amigos', listaAmigos);
  });

  socket.on('adicionar-amigo', (data) => {
    const { meuId, amigoId } = data;
    const amigoSocket = users[amigoId];

    if (amigoSocket) {
        io.to(amigoSocket).emit('pedido-amizade', {
            deId: meuId,
            nome: userData[meuId].username,
            avatar: userData[meuId].avatar
        });
    }
  });

  socket.on('aceitar-amizade', (data) => {
    const { meuId, deId } = data;
    
    if(!friends[meuId].includes(deId)) friends[meuId].push(deId);
    if(!friends[deId].includes(meuId)) friends[deId].push(meuId);

    // Atualiza a lista de quem aceitou
    const minhaLista = friends[meuId].map(id => ({ discordId: id, username: userData[id]?.username, avatar: userData[id]?.avatar }));
    socket.emit('carregar-amigos', minhaLista);

    // Atualiza a lista de quem enviou o pedido
    const amigoSocket = users[deId];
    if (amigoSocket) {
        const listaAmigo = friends[deId].map(id => ({ discordId: id, username: userData[id]?.username, avatar: userData[id]?.avatar }));
        io.to(amigoSocket).emit('carregar-amigos', listaAmigo);
    }
  });

  // --- ROTAS DE CHAMADA WEBRTC ---
  
  socket.on('chamar-amigo', (data) => {
    const targetSocket = users[data.para];
    if (targetSocket) {
      io.to(targetSocket).emit('chamada-recebida', { offer: data.offer, de: socket.id });
    }
  });

  socket.on('responder-chamada', (data) => {
    io.to(data.para).emit('resposta-recebida', data.answer);
  });

  socket.on('ice-candidate', (data) => {
    io.to(data.para).emit('ice-candidate', data.candidate);
  });

  // NOVA ROTA: REPASA O ENCERRAMENTO DA CHAMADA
  socket.on('encerrar-chamada', (data) => {
      // Se ele passou um discordId, pegamos o socket, se passou o socketId, usamos direto
      const targetSocket = users[data.para] || data.para; 
      if(targetSocket) {
          io.to(targetSocket).emit('chamada-encerrada');
      }
  });

  socket.on('disconnect', () => {
    console.log('Usuário desconectado:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});