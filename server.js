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

  socket.on('registrar', (data) => {
    // Agora aceita tanto o formato antigo quanto o novo com os amigos do PC
    const user = data.user || data; 
    const clientFriends = data.friends || [];

    users[user.id] = socket.id;
    userData[user.id] = user;
    if(!friends[user.id]) friends[user.id] = [];
    
    // Injeta os amigos salvos no LocalStorage para o servidor
    clientFriends.forEach(amigo => {
        if(!friends[user.id].includes(amigo.discordId)) {
            friends[user.id].push(amigo.discordId);
        }
        if(!userData[amigo.discordId]) {
            userData[amigo.discordId] = { username: amigo.username, avatar: amigo.avatar, id: amigo.discordId };
        }
    });

    // Manda a lista de amigos atualizada de volta
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

  // --- LOG DE SEGURANÇA / REPORT ---
  socket.on('reportar-usuario', (data) => {
      console.log(`\n🚨 [ALERTA DE SEGURANÇA]`);
      console.log(`O Usuário ${data.denunciante} REPORTOU e BLOQUEOU o Usuário ${data.infrator}!`);
      console.log(`Por favor, verifique o ID do infrator para possível banimento da rede.\n`);
  });

  // --- ROTAS DE CHAMADA WEBRTC ---
  
  socket.on('chamar-amigo', (data) => {
    const targetSocket = users[data.para];
    if (targetSocket) {
      io.to(targetSocket).emit('chamada-recebida', { offer: data.offer, de: data.deId });
    }
  });

  socket.on('responder-chamada', (data) => {
    const targetSocket = users[data.para];
    if (targetSocket) {
        io.to(targetSocket).emit('resposta-recebida', data.answer);
    }
  });

  socket.on('ice-candidate', (data) => {
    const targetSocket = users[data.para];
    if (targetSocket) {
        io.to(targetSocket).emit('ice-candidate', data.candidate);
    }
  });

  socket.on('encerrar-chamada', (data) => {
      const targetSocket = users[data.para]; 
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