const app = require("express")();
const server = require("http").createServer(app);
const cors = require("cors");
const axios = require('axios');
const { codeCache } = require("./codes");
const Room = require("./room");
const HCAPTCHA_SECRET = "0x0000000000000000000000000000000000000000";
const MAX_IN_ROOM = 30;
const GARBAGE_COLLECT_ROOM_TIME = 1200000; // 20 minutes
const TIME_TO_STAY_IDLE = 1200000; // 20 minutes
const TIME_TO_STAY_FULL = 14400000; // 4 hours

const rooms = new Map();

const io = require("socket.io")(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());

const PORT = process.env.PORT || 5000;

// Garbage collect rooms
setInterval(() => {
    for (let entry of rooms) {
        room = entry[1];
        let roomDuration = Date.now() - room.createdAt;

        // Detect if room existed for too long with users inside
        if (room.length() !== 0 && roomDuration >= TIME_TO_STAY_FULL) {
            garbageCollectRoom(entry[0]);
            continue;
        }

        // Detect if room existed for too long without users inside
        if (room.length() == 0 && roomDuration >= TIME_TO_STAY_IDLE) {
            garbageCollectRoom(entry[0]);
            continue;
        }
    }
}, GARBAGE_COLLECT_ROOM_TIME)

function garbageCollectRoom(socketId) {
    rooms.delete(socketId);
    codeCache.unBind(socketId);
    io.to(socketId).emit("garbageCollected");
}

app.get("/", (req, res) => {
    res.send("Server is running.");
});

io.use((socket, next) => {
    let token = socket.handshake.query.captchaToken;
    verifyCaptcha(token, (result) => {
        if (result) {
            next();
        }
        else {
            next(new Error("Invalid captcha token."))
        }
    })

})

io.on("connection", (socket) => {
    socket.emit("success", { socketId: socket.id });

    socket.on("createroom", () => {
        rooms.set(socket.id, new Room());

        io.emit("roomcreated", {
            id: codeCache.bind(socket.id)
        });
    })

    socket.on("disconnect", () => {
        if (codeCache.codes.hasKey(socket.id)) {
            if (rooms.get(socket.id).length() !== 0) {
                // Host migration
                // Set variables
                let room = rooms.get(socket.id);
                let connections = room.connections;
                let newHost = connections[0];
                let newHostSocketId = newHost.from;
                let code = codeCache.get(socket.id);

                // Set up codeCache
                codeCache.unBind(socket.id);
                codeCache.bindWithCode(newHostSocketId, code);

                // Set up rooms
                connections.splice(0, 1);
                room.connections = connections;
                rooms.delete(socket.id);
                rooms.set(newHostSocketId, room);

                // Send alerts
                io.to(newHostSocketId).emit("becomeHost");
                connections.forEach((con) => {
                    io.to(con.from).emit("hostMigration");
                });
            }
            else {
                codeCache.unBind(socket.id);
                rooms.delete(socket.id);
            }
        }
    });

    socket.on("joinroom", ({ userToCall: code, signalData, from, name }) => {
        let id = codeCache.getSocketId(code);

        if (id === null) {
            io.emit("No such code exists");
            return;
        }

        if (rooms.get(id).length() >= MAX_IN_ROOM) {
            io.emit("Too many people in the room");
            return;
        }

        io.to(id).emit("joinroom", { signal: signalData, from, name });
    })

    socket.on("answerJoinRequest", (data) => {
        io.to(data.to).emit("joinAccepted", data.signal)
    })

    socket.on("memberJoin", (data) => {
        if (rooms.has(socket.id)) {
            let room = rooms.get(socket.id);
            room.addConnection(data);
            rooms.set(socket.id, room);
        }
    });

    socket.on("memberLeave", (data) => {
        if (rooms.has(socket.id)) {
            let room = rooms.get(socket.id);
            room.removeConnection(data);
            rooms.set(socket.id, room);
        }
    })
})

const verifyCaptcha = (token, callback) => {
    let body = `response=${token}&secret=${HCAPTCHA_SECRET}`

    axios.post("https://hcaptcha.com/siteverify", body, {
        headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=utf-8"
        }
    })
        .then(res => {
            let data = res.data;
            callback(data.success);
        })
        .catch(error => {
            callback(false);
        })
}

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}.`);
});