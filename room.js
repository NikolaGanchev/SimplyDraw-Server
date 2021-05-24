class Room {
    createdAt;
    connections;

    constructor() {
        this.createdAt = Date.now();
        this.connections = [];
    }

    addConnection(connection) {
        this.connections.push(connection);
    }

    removeConnection(connection) {
        this.connections.splice(this.connections.indexOf(connection), 1);
    }

    length() {
        return this.connections.length;
    }
}

module.exports = Room;