var mongoose = require('mongoose');
var schema=new mongoose.Schema({
    username:{type:String,required:true,unique:true},
    email:{type:String,required:true,unique:true},
    password:{type:String,required:true},
    keystore:{type:String,unique:true},
    mnemonic:{type:String,unique:true},
    privatekey:{type:String,unique:true},
    publickey:{type:String,unique:true},
    address:{type:String,unique:true},
});
var User = mongoose.model('User',schema);
module.exports = User;