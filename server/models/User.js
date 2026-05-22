const mongoose = require('mongoose');
const crypto = require('crypto');

const userSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, trim: true },
    password: { type: String, default: null }, // scrypt-hashed when present
    salt: { type: String, default: null },
    displayName: { type: String, trim: true, default: '' },
    role: { type: String, default: null },
    lastLogin: { type: Date, default: null },
  },
  { timestamps: true }
);

// Hash password before save (only if changed and non-empty)
userSchema.pre('save', function (next) {
  if (!this.isModified('password') || !this.password) return next();
  const salt = crypto.randomBytes(16).toString('hex');
  crypto.scrypt(this.password, salt, 64, (err, derivedKey) => {
    if (err) return next(err);
    this.salt = salt;
    this.password = derivedKey.toString('hex');
    next();
  });
});

// Compare candidate password to stored hash
userSchema.methods.comparePassword = function (candidate) {
  return new Promise((resolve, reject) => {
    if (!this.password) return resolve(true); // no password set = always pass
    if (!candidate) return resolve(false);
    crypto.scrypt(candidate, this.salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(derivedKey.toString('hex') === this.password);
    });
  });
};

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
