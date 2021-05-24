class CodeCache {
    codes = new UniqueMap();

    constructor() {
    }

    bind(socketId) {
        let code = this.generateCode()
        while (this.codes.hasValue(code)) {
            code = this.generateCode();
        }

        this.codes.addPair(socketId, code);
        return code;
    }

    bindWithCode(socketId, code) {
        this.codes.addPair(socketId, code);
        return code;
    }

    unBind(socketId) {
        if (this.codes.hasKey(socketId)) {
            this.codes.deleteByKey(socketId);
        };
    }

    generateCode() {
        const LENGTH = 6;
        let code = [];
        let characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

        for (let i = 0; i < LENGTH; i++) {
            code.push(characters.charAt(Math.floor(Math.random() * characters.length)));
        }

        return code.join('');
    }

    get(socketId) {
        if (this.codes.hasKey(socketId)) {
            return this.codes.getValueByKey(socketId);
        }
        return null;
    }

    getSocketId(code) {
        if (this.codes.hasValue(code)) {
            return this.codes.getKeyByValue(code);
        }

        return null;
    }
}

class UniqueMap {
    keys = new Map();
    values = new Map();

    constructor() { }

    addPair(key, value) {
        if (!(this.keys.has(key) && this.values.has(value))) {
            this.keys.set(key, value);
            this.values.set(value, key);
        }
    }

    getValueByKey(key) {
        if (this.keys.has(key)) {
            return this.keys.get(key);
        }
    }

    getKeyByValue(value) {
        if (this.values.has(value)) {
            return this.values.get(value);
        }
    }

    hasKey(key) {
        return this.keys.has(key);
    }

    hasValue(value) {
        return this.values.has(value);
    }

    deleteByKey(key) {
        if (this.keys.has(key)) {
            this.keys.delete(key);
            this.values.delete(this.getValueByKey(key));
        }
    }

    deleteByValue(value) {
        if (this.value.has(value)) {
            this.values.delete(value);
            this.key.delete(this.getKeyByValue(value));
        }
    }
}

const codeCache = new CodeCache();

module.exports = { codeCache }