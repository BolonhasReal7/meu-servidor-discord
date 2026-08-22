const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Libera conexões de qualquer aplicativo (CORS)
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// --- BANCOS DE DADOS EM MEMÓRIA ---
const socketToDiscord = {}; 
const discordToSocket = {}; 
const usersData = {};       

io.on('connection', (socket) => {
    console.log(`🟢 Nova conexão recebida: ${socket.id}`);

    // 1. SISTEMA DE LOGIN E REGISTRO
    socket.on('registrar', (data) => {
        const discordId = data.user.id;
        
        socketToDiscord[socket.id] = discordId;
        discordToSocket[discordId] = socket.id;
        usersData[discordId] = data.user;

        console.log(`👤 Registrado: ${data.user.username} (${discordId})`);
    });

    // 2. STATUS PERSONALIZADO
    socket.on('atualizar-status', (data) => {
        io.emit('status-atualizado', data); 
    });

    // 3. SISTEMA DE ADICIONAR/REMOVER AMIGOS
    socket.on('adicionar-amigo', (data) => {
        const { meuId, amigoId } = data;
        const socketDoAmigo = discordToSocket[amigoId];
        
        if (socketDoAmigo && usersData[meuId]) {
            const meuUser = usersData[meuId];
            io.to(socketDoAmigo).emit('pedido-amizade', {
                deId: meuId,
                nome: meuUser.global_name || meuUser.username,
                avatar: meuUser.avatar
            });
        }
    });

    socket.on('aceitar-amizade', (data) => {
        const socketDeQuemEnviou = discordToSocket[data.deId];
        const socketDeQuemAceitou = discordToSocket[data.meuId];

        const userDe = usersData[data.deId];
        const userMeu = usersData[data.meuId];

        if (socketDeQuemEnviou && userMeu) {
            io.to(socketDeQuemEnviou).emit('amizade-aceita', { 
                discordId: data.meuId, username: userMeu.global_name || userMeu.username, avatar: userMeu.avatar 
            });
        }
        
        if (socketDeQuemAceitou && userDe) {
            io.to(socketDeQuemAceitou).emit('amizade-aceita', { 
                discordId: data.deId, username: userDe.global_name || userDe.username, avatar: userDe.avatar 
            });
        }
    });

    socket.on('remover-amizade', (data) => {
        const socketDoAmigo = discordToSocket[data.amigoId];
        if (socketDoAmigo) {
            io.to(socketDoAmigo).emit('amizade-removida', data.meuId);
        }
    });

    // 4. SINALIZAÇÃO WEBRTC
    socket.on('chamar-amigo', (data) => {
        const socketDestino = discordToSocket[data.para];
        if (socketDestino) {
            io.to(socketDestino).emit('chamada-recebida', { offer: data.offer, de: data.deId });
        }
    });

    socket.on('responder-chamada', (data) => {
        const socketDestino = discordToSocket[data.para];
        if (socketDestino) {
            io.to(socketDestino).emit('resposta-recebida', data.answer);
        }
    });

    socket.on('ice-candidate', (data) => {
        const socketDestino = discordToSocket[data.para];
        if (socketDestino) io.to(socketDestino).emit('ice-candidate', data.candidate);
    });

    socket.on('encerrar-chamada', (data) => {
        const socketDestino = discordToSocket[data.para];
        if (socketDestino) io.to(socketDestino).emit('chamada-encerrada');
    });

    // 5. DENÚNCIAS
    socket.on('reportar-usuario', (data) => {
        console.warn(`🚨 ALERTA: Usuário ${data.denunciante} denunciou o ID: ${data.infrator}`);
    });

    // 6. SISTEMA DE PRESENÇA (ONLINE/OFFLINE)
    socket.on('disconnect', () => {
        const discordIdQueCaiu = socketToDiscord[socket.id];
        
        if (discordIdQueCaiu) {
            console.log(`🔴 Usuário Desconectado: ${discordIdQueCaiu}`);
            socket.broadcast.emit('amigo-offline', discordIdQueCaiu);
            delete discordToSocket[discordIdQueCaiu];
            delete socketToDiscord[socket.id];
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor P2P rodando na porta ${PORT}`);
});