const app = require("express")();
const server = require("http").createServer(app);
const cors = require("cors");
const axios = require('axios');
const { codeCache } = require("./codes");
const Room = require("./room");
const Connection = require("./connection");
require('dotenv').config();
const HCAPTCHA_SECRET = process.env.HCAPTCHA_SECRET;
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

        // Detect if room existed for too long with members inside
        if (room.length() !== 0 && roomDuration >= TIME_TO_STAY_FULL) {
            garbageCollectRoom(entry[0]);
            continue;
        }

        // Detect if room existed for too long without members inside
        if (room.length() == 0 && roomDuration >= TIME_TO_STAY_IDLE) {
            garbageCollectRoom(entry[0]);
            continue;
        }
    }
}, GARBAGE_COLLECT_ROOM_TIME)

function garbageCollectRoom(socketId) {
    // Send event to the remaining connections
    rooms.get(socketId).connections.forEach((con) => {
        // if available, send event
        io.to(con.from).emit("garbageCollected");
    })
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
            next(new Error("Invalid captcha token."));
        }
    });
})

io.on("connection", (socket) => {
    socket.emit("success", { socketId: socket.id });

    socket.on("createroom", () => {
        rooms.set(socket.id, new Room());

        io.to(socket.id).emit("roomcreated", {
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
                let newHost = null;

                let socketList = io.sockets.server.eio.clients;

                // Find new host
                while (newHost == null) {
                    // If all options are exhausted, just garbage collect the room
                    if (connections.length === 0) {
                        garbageCollectRoom(socket.id);
                    }

                    // Select the newest candidate
                    let candidate = connections[0];

                    // Check availability status
                    if (socketList[candidate.from] === undefined) {
                        // If available, the new host is the candidate
                        newHost = candidate;
                    }

                    // In any case a connection has either been selected for host or found unusable, so the first element
                    // of the array is removed
                    connections.splice(0, 1);
                }

                let newHostSocketId = newHost.from;
                let code = codeCache.get(socket.id);

                // Set up codeCache
                codeCache.unBind(socket.id);
                codeCache.bindWithCode(newHostSocketId, code);

                // Set up rooms
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
                garbageCollectRoom(socket.id);
            }
        }
    });

    socket.on("joinroom", ({ userToCall: code, signalData, from, name }) => {
        let id = codeCache.getSocketId(code);

        if (id === null) {
            io.to(socket.id).emit("noSuchCode");
            return;
        }

        if (rooms.get(id) && rooms.get(id).length() >= MAX_IN_ROOM) {
            io.to(socket.id).emit("tooManyInRoom");
            return;
        }

        io.to(id).emit("joinroom", { signal: signalData, from, name });
    })

    socket.on("answerJoinRequest", (data) => {
        io.to(data.to).emit("joinAccepted", data.signal)
    })

    socket.on("memberJoin", (data) => {
        if (rooms.has(socket.id)) {
            io.to(data.from).emit("joinTrySuccessful", { code: codeCache.get(socket.id) });
        }
    });

    socket.on("joinTrySuccessful", ({ code }) => {
        let hostSocketId = codeCache.getSocketId(code);

        if (hostSocketId === null) {
            io.to(socket.id).emit("noSuchCode");
        }

        if (rooms.has(hostSocketId)) {
            let room = rooms.get(hostSocketId);

            // Too many members in the room
            if (room.length() > MAX_IN_ROOM) return;

            let connection = new Connection(socket.id);

            room.addConnection(connection);
            rooms.set(hostSocketId, room);
        }
    });

    socket.on("memberLeave", (data) => {
        if (rooms.has(socket.id)) {

            let connection;
            try {
                connection = new Connection(data.from);
            }
            catch (e) {
                // object was not compatible with connection
                return;
            }

            let socketIdOfLeftMember = data.from;

            // Check if the user is actually in the room
            if (!rooms.get(socket.id).hasConnection(connection)) return

            // Check if the user actually left the room and disconnect them if they didn't
            let socketList = io.sockets.server.eio.clients;
            if (socketList[socketIdOfLeftMember] != undefined) {
                socketList[socketIdOfLeftMember].disconnect();
            }

            let room = rooms.get(socket.id);
            room.removeConnection(connection);
            rooms.set(socket.id, room);
        }
    }
    );

    socket.on("disbandRoom", () => {
        if (rooms.has(socket.id)) {
            garbageCollectRoom(socket.id);
        }
    });
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