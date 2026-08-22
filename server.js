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
// Em um app comercial usamos SQL/MongoDB, mas para altíssima velocidade usamos a memória RAM:
const socketToDiscord = {}; // Mapeia o ID da conexão -> ID do Discord
const discordToSocket = {}; // Mapeia o ID do Discord -> ID da conexão
const usersData = {};       // Guarda informações visuais (nome, avatar)

io.on('connection', (socket) => {
    console.log(`🟢 Nova conexão recebida: ${socket.id}`);

    // 1. SISTEMA DE LOGIN E REGISTRO
    socket.on('registrar', (data) => {
        const discordId = data.user.id;
        
        // Salva as referências cruzadas
        socketToDiscord[socket.id] = discordId;
        discordToSocket[discordId] = socket.id;
        usersData[discordId] = data.user;

        console.log(`👤 Registrado: ${data.user.username} (${discordId})`);
    });

    // 2. STATUS PERSONALIZADO (Ex: "Jogando Valorant")
    socket.on('atualizar-status', (data) => {
        // data = { id: discordId, status: "Jogando..." }
        io.emit('status-atualizado', data); 
    });

    // 3. SISTEMA DE AMIZADES
    socket.on('adicionar-amigo', (data) => {
        const { meuId, amigoId } = data;
        const socketDoAmigo = discordToSocket[amigoId];
        
        // Se o amigo estiver online, envia o popup de convite
        if (socketDoAmigo && usersData[meuId]) {
            const meuUser = usersData[meuId];
            io.to(socketDoAmigo).emit('pedido-amizade', {
                deId: meuId,
                nome: meuUser.global_name || meuUser.username,
                avatar: meuUser.avatar
            });
        }
    });

    // 4. SINALIZAÇÃO WEBRTC (O CORAÇÃO DO P2P)
    // O servidor não toca no vídeo, apenas entrega os "endereços de IP" (ofertas/respostas)
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

    // 5. DENÚNCIAS E SEGURANÇA
    socket.on('reportar-usuario', (data) => {
        console.warn(`🚨 ALERTA: Usuário ${data.denunciante} denunciou/bloqueou o ID: ${data.infrator}`);
        // No futuro, podemos injetar uma lógica de banimento aqui
    });

    // 6. --- NOVO: SISTEMA DE PRESENÇA (ONLINE/OFFLINE) ---
    socket.on('disconnect', () => {
        const discordIdQueCaiu = socketToDiscord[socket.id];
        
        if (discordIdQueCaiu) {
            console.log(`🔴 Usuário Desconectado: ${discordIdQueCaiu}`);
            
            // O Grito do Servidor: Avisa TODOS na rede que esse ID caiu!
            socket.broadcast.emit('amigo-offline', discordIdQueCaiu);
            
            // Limpa as conexões velhas da memória RAM
            delete discordToSocket[discordIdQueCaiu];
            delete socketToDiscord[socket.id];
        }
    });
});

// Inicia o servidor (O Railway define a porta automaticamente)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor de Sinalização rodando na porta ${PORT}`);
});