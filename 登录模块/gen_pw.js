const { encrypt } = require('./rsa_encrypt.js');
const cipher = encrypt('123123');
function fn(pw){
    return encrypt(pw);
}