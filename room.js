class Room {
    createdAt;
    connections;

    constructor() {
        this.createdAt = Date.now();
        this.connections = [];
    }

    addConnection(connection) {
        if (!this.hasConnection(connection)) {
            this.connections.push(connection);
        }
    }

    removeConnection(connection) {
        this.connections.splice(this.connections.indexOf(connection), 1);
    }

    length() {
        return this.connections.length;
    }

    hasConnection(connection) {
        let hasConnection = false;

        for (let con of this.connections) {
            if (con.from === connection.from) {
                hasConnection = true;
                break;
            }
        }

        return hasConnection;
    }
}

module.exports = Room;