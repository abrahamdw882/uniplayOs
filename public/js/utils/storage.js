class Storage {
  static prefix = 'uniplayos:';

  static set(key, value) {
    try {
      const serialized = JSON.stringify(value);
      localStorage.setItem(this.prefix + key, serialized);
      return true;
    } catch {
      return false;
    }
  }

  static get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(this.prefix + key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  static remove(key) {
    localStorage.removeItem(this.prefix + key);
  }

  static has(key) {
    return localStorage.getItem(this.prefix + key) !== null;
  }

  static clear() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(this.prefix));
    keys.forEach(k => localStorage.removeItem(k));
  }

  static keys() {
    return Object.keys(localStorage)
      .filter(k => k.startsWith(this.prefix))
      .map(k => k.slice(this.prefix.length));
  }
}

if (typeof window !== 'undefined') {
  window.Storage = Storage;
}
