const io = require('socket.io')(3000, { cors: { origin: '*' } });
const mongoose = require('mongoose');

// ⚠️ COLOQUE SUA URL DO MONGODB AQUI DENTRO (Use uma string segura!)
const MONGO_URL = 'mongodb+srv://SEU_USUARIO:SUA_SENHA@seu-cluster.mongodb.net/?retryWrites=true&w=majority';

mongoose.connect(MONGO_URL)
    .then(() => console.log('✅ Conectado ao MongoDB!'))
    .catch(err => console.error('❌ Erro no MongoDB:', err));

// Estrutura do Banco de Dados
const UserSchema = new mongoose.Schema({
    discordId: String,
    username: String,
    avatar: String,
    friends: [String] // Array com os IDs do Discord dos amigos
});
const User = mongoose.model('User', UserSchema);

const usuarios = {}; 

io.on('connection', socket => {
    // Registra o usuário e busca os amigos
    socket.on('registrar', async (userData) => {
        usuarios[userData.id] = socket.id;
        console.log(`Usuário conectado: ${userData.username}`);

        try {
            // Salva ou atualiza o usuário no Banco
            let dbUser = await User.findOne({ discordId: userData.id });
            if (!dbUser) {
                dbUser = new User({ discordId: userData.id, username: userData.username, avatar: userData.avatar, friends: [] });
                await dbUser.save();
            }

            // Busca a lista de amigos no banco e envia para o frontend
            const amigos = await User.find({ discordId: { $in: dbUser.friends } });
            socket.emit('carregar-amigos', amigos);
        } catch (err) {
            console.error("Erro ao registrar:", err);
        }
    });

    // 1. Envia o pedido de amizade para a tela do amigo (NÃO adiciona direto mais)
    socket.on('adicionar-amigo', async (data) => {
        try {
            const eu = await User.findOne({ discordId: data.meuId });
            const amigo = await User.findOne({ discordId: data.amigoId });

            // Verifica se os dois existem e se já não são amigos
            if (eu && amigo && !eu.friends.includes(data.amigoId)) {
                const socketDoAmigo = usuarios[data.amigoId];
                if (socketDoAmigo) {
                    // Se o amigo estiver online, envia o pop-up para ele
                    io.to(socketDoAmigo).emit('pedido-amizade', { 
                        deId: data.meuId, 
                        nome: eu.username, 
                        avatar: eu.avatar 
                    });
                }
            }
        } catch (err) { 
            console.error("Erro ao enviar pedido:", err); 
        }
    });

    // 2. Quando o amigo clica no botão "Aceitar" no Pop-up
    socket.on('aceitar-amizade', async (data) => {
        try {
            const eu = await User.findOne({ discordId: data.meuId }); // quem aceitou
            const amigo = await User.findOne({ discordId: data.deId }); // quem enviou

            if (eu && amigo && !eu.friends.includes(data.deId)) {
                eu.friends.push(data.deId);
                amigo.friends.push(data.meuId);
                await eu.save();
                await amigo.save();
                
                // Atualiza a tela de quem aceitou
                const meusAmigos = await User.find({ discordId: { $in: eu.friends } });
                socket.emit('carregar-amigos', meusAmigos);

                // Atualiza a tela de quem enviou (se ele ainda estiver online)
                const socketDoAmigo = usuarios[data.deId];
                if (socketDoAmigo) {
                    const amigosDele = await User.find({ discordId: { $in: amigo.friends } });
                    io.to(socketDoAmigo).emit('carregar-amigos', amigosDele);
                }
            }
        } catch (err) { 
            console.error("Erro ao aceitar amizade:", err); 
        }
    });

    // Encaminha a chamada de vídeo para o amigo
    socket.on('chamar-amigo', data => {
        const socketAmigo = usuarios[data.para];
        if (socketAmigo) {
            io.to(socketAmigo).emit('chamada-recebida', { offer: data.offer, de: socket.id, deId: data.deId });
        }
    });

    // Responde a chamada
    socket.on('responder-chamada', data => {
        io.to(data.para).emit('resposta-recebida', data.answer);
    });

    // Sincroniza a conexão (ICE Candidates)
    socket.on('ice-candidate', data => {
        io.to(data.para).emit('ice-candidate', data.candidate);
    });
});

console.log("🔥 Servidor Kaneki rodando na porta 3000...");