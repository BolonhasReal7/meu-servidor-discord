const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);

// Configuração do Socket para aceitar conexões do seu aplicativo
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// A sua URL real do MongoDB
const MONGO_URL = 'mongodb+srv://meneguellijuniorrodrigo_db_user:uH3khHbhXwVDnuQQ@cluster0.zrkopl8.mongodb.net/?appName=Cluster0';

mongoose.connect(MONGO_URL)
  .then(() => console.log('✅ Conectado ao MongoDB!'))
  .catch((err) => console.error('❌ Erro no MongoDB:', err));

// Criando a "Tabela" no Banco de Dados para salvar os usuários e amigos
const userSchema = new mongoose.Schema({
    discordId: String,
    username: String,
    avatar: String,
    friends: [String] // Lista de IDs dos amigos
});
const User = mongoose.model('User', userSchema);

// Dicionário para saber qual socket.id pertence a qual Discord ID
let usuariosConectados = {};

io.on('connection', (socket) => {
    console.log('🔌 Novo dispositivo conectado:', socket.id);

    // 1. Quando o usuário faz login no seu app
    socket.on('registrar', async (userData) => {
        usuariosConectados[userData.id] = socket.id;
        
        // Verifica se o usuário já existe no banco, se não, cria
        let user = await User.findOne({ discordId: userData.id });
        if (!user) {
            user = new User({ discordId: userData.id, username: userData.username, avatar: userData.avatar });
            await user.save();
        }

        // Busca os amigos desse usuário no banco e envia para o HTML
        const amigos = await User.find({ discordId: { $in: user.friends } });
        socket.emit('carregar-amigos', amigos);
    });

    // 2. Quando você clica no botão "+" para adicionar alguém
    socket.on('adicionar-amigo', async (data) => {
        const { meuId, amigoId } = data;
        
        // Pega as informações de quem enviou o convite
        const eu = await User.findOne({ discordId: meuId });
        
        if(eu) {
            // Se o amigo estiver online, envia o pop-up para ele!
            const socketDoAmigo = usuariosConectados[amigoId];
            if(socketDoAmigo) {
                io.to(socketDoAmigo).emit('pedido-amizade', {
                    deId: meuId,
                    nome: eu.username,
                    avatar: eu.avatar
                });
            }
        }
    });

    // 3. Quando o amigo clica em "Aceitar" no pop-up
    socket.on('aceitar-amizade', async (data) => {
        const { meuId, deId } = data;
        
        // Salva a amizade para os dois lados no MongoDB
        await User.updateOne({ discordId: meuId }, { $addToSet: { friends: deId } });
        await User.updateOne({ discordId: deId }, { $addToSet: { friends: meuId } });

        // Atualiza a lista de amigos na tela de quem aceitou
        const eu = await User.findOne({ discordId: meuId });
        const meusAmigos = await User.find({ discordId: { $in: eu.friends } });
        socket.emit('carregar-amigos', meusAmigos);

        // Se quem enviou o convite ainda estiver online, atualiza a tela dele também
        const socketDeQuemEnviou = usuariosConectados[deId];
        if(socketDeQuemEnviou) {
            const amigo = await User.findOne({ discordId: deId });
            const amigosDele = await User.find({ discordId: { $in: amigo.friends } });
            io.to(socketDeQuemEnviou).emit('carregar-amigos', amigosDele);
        }
    });

    // ==========================================
    // SISTEMA DE LIGAÇÃO DE VÍDEO (WebRTC) P2P
    // ==========================================
    
    socket.on('chamar-amigo', (data) => {
        const socketDoAmigo = usuariosConectados[data.para];
        if(socketDoAmigo) {
            // Repassa a chamada. Manda o socket.id de quem ligou para ele saber pra onde responder
            io.to(socketDoAmigo).emit('chamada-recebida', { offer: data.offer, de: socket.id });
        }
    });

    socket.on('responder-chamada', (data) => {
        io.to(data.para).emit('resposta-recebida', data.answer);
    });

    socket.on('ice-candidate', (data) => {
        io.to(data.para).emit('ice-candidate', data.candidate);
    });

    // ==========================================

    socket.on('disconnect', () => {
        // Remove da lista de conectados quando o usuário fecha o app
        for (let id in usuariosConectados) {
            if (usuariosConectados[id] === socket.id) {
                delete usuariosConectados[id];
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🔥 Servidor rodando perfeitamente na porta ${PORT}...`);
});