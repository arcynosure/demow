const Web3 = require('web3');
const express = require('express');
const path = require('path');
const app = express();
const session = require('express-session');
const bip39 = require('bip39');
const hdkey = require('hdkey');
const hdkeys = require('ethereumjs-wallet/hdkey');
const ethUtil = require('ethereumjs-util');
const wallet = require("ethereumjs-wallet")

let fs = require('fs');
let cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const User = require('./model/registermodel');
let flash = require('connect-flash-plus');

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
let dbconnect = require('./connections/mongodb_connect');

//Infura HttpProvider Endpoint
const web3 = new Web3(
  new Web3.providers.HttpProvider(
    'https://ropsten.infura.io/v3/909d734d85f0460a92f50996e7aa2eb0'
  )
);

//session cookie
app.use(
  session({
    key: 'user_sid',
    secret: 'somerandonstuffs',
    resave: false,
    secure: false,
    saveUninitialized: false,
    cookie: {
      expires: 1000000000
    }
  })
);
app.use(cookieParser());
app.use(flash());

let checkMiddleWare = (req, res, next) => {
  if (!req.session.username) {
    res.redirect('/');
  }

  next();
};

app.get('/', function(req, res) {
  res.render('login');
});

app.post('/login', async (req, res) => {
  let posts = req.body;
  let username = posts.username;
  let password = posts.password;

  let user = await User.findOne({ username: username, password: password });
  if (!user) {
    res.redirect('/');
  } else {
    req.session.username = username;
    res.redirect('/dashboard');
  }
});

app.post('/register', function(req, res) {
  let posts = req.body;
  let username = posts.username;
  let email = posts.email;
  let password = posts.password;
  let confirm_pwd = posts.confirm_password;

  if (password !== confirm_pwd) {
    res.redirect('/');
  } else {
    /* create new hd wallet */
    const mnemonic = bip39.generateMnemonic(); //generates string
    console.log('Mnemonic:', mnemonic);

    const seed = bip39.mnemonicToSeed(mnemonic); //creates seed buffer

    const root = hdkey.fromMasterSeed(seed);

    const masterPrivateKey = root.privateKey.toString('hex');
    console.log('Master private Key:', masterPrivateKey);

    const masterPubKey = root.publicKey.toString('hex');
    console.log('Master Public Key: ', masterPubKey);

    let path = "m/44'/60'/0'/0/0";

    const addrNode = root.derive(path);
    console.log('path: ', path);

    const pubKey = ethUtil.privateToPublic(addrNode._privateKey);
    console.log('Pubkey as hex:', pubKey.toString('hex'));

    const addr = ethUtil.publicToAddress(pubKey).toString('hex');
    console.log('pubkey to Addr:', addr);

    let privateKeys = addrNode._privateKey.toString('hex');

    let keystore = JSON.stringify(
      web3.eth.accounts.encrypt(privateKeys, password)
    );

    /* save user */
    let newUser = new User({
      username: username,
      email: email,
      password: password,
      keystore: keystore,
      mnemonic: mnemonic,
      privatekey: privateKeys,
      publickey: masterPubKey,
      address: '0x' + addr
    });

    newUser.save(function(err) {
      console.log(err);
    });

    req.session.username = username;
    res.redirect('/dashboard');
  }
});

app.get('/dashboard', checkMiddleWare, async (req, res) => {
  let username = req.session.username;

  res.render('dashboard', { message: username });
});

app.get('/logout', function(req, res) {
  req.session.destroy();
  res.redirect('/');
});

app.post('/download', async (req, res) => {
  let username = req.session.username;
  let user = await User.findOne({ username: username });

  fs.writeFile(
    'keystore/keystore-' + user._id + '.json',
    user.keystore,
    function(err) {
      if (err) console.log(err);
      console.log('Successfully Written to File.');
      let file = __dirname + '/keystore/keystore-' + user._id + '.json';
      console.log("iam here"+file);
      res.download(file);
    }
  );
});

app.get('/checkbalance', async (req, res) => {
  let username = req.session.username;
  let user = await User.findOne({ username: username });

  let balance = await web3.eth.getBalance(user.address);
  res.render('pages/checkbalance', {
    message: username,
    balance: web3.utils.fromWei(balance, 'ether')
  });
});

app.get('/sendtransaction?:balance', async (req, res) => {
  let username = req.session.username;
  let user = await User.findOne({ username: username });

  res.render('pages/sendtrxn', { message: username, address: user.address });
});

app.post('/transactioncomplete', async (req, res) => {
  let username = req.session.username;
  let user = await User.findOne({ username: username });

  const privateKey = '0x' + user.privatekey;
  console.log('private key' + privateKey);

  let posts = req.body;
  let toAccount = posts.toAccount;
  let amounts = posts.amounts;

  /* send transaction */
  const rawTransaction = {
    to: toAccount,
    value: web3.utils.toHex(web3.utils.toWei(amounts, 'ether')),
    gasPrice: '0x4A817C800',
    gasLimit: '0x9C40',
    chainId: 4
  };

  console.log(rawTransaction);
  /* check balance before send */
  let balance = await web3.eth.getBalance(user.address);
  let checkBalance = web3.utils.fromWei(balance, 'ether');

  console.log('Check amount' + amounts);
  console.log('Check balance' + checkBalance);

  if (amounts > checkBalance) {
    res.json({ amount: 'false' });
  } else {
    let trxn = await web3.eth.accounts
      .signTransaction(rawTransaction, privateKey)
      .then(signedTx => web3.eth.sendSignedTransaction(signedTx.rawTransaction))
      .then(receipt => console.log(receipt))
      .catch(err => console.error(err));

    console.log('Transaction complete ' + trxn);

    res.json({ trnx: 'success' });
  }
});

app.get('/home', async (req, res) => {
  let username = req.session.username;
  let user = await User.findOne({ username: username });

  res.render('pages/home', { message: username, mnemonic: user.mnemonic });
});

app.get('/restore', async (req, res) => {
  res.render('pages/restore');
});





app.post('/sendrestore', async (req, res) => {
  let { mnemonic } = req.body;

  let username = req.session.username;
  let user = await User.findOne({ username: username });


  /* restore account */
  let hdwallet = hdkeys.fromMasterSeed(bip39.mnemonicToSeed(mnemonic));
  let wallet_hdpath = "m/44'/60'/0'/0/";

  let accounts = [];
  let privateKey
  for (let i = 0; i < 10; i++) {
    let wallet = hdwallet.derivePath(wallet_hdpath + i).getWallet();
    let address = '0x' + wallet.getAddress().toString('hex');
    privateKey = wallet.getPrivateKey();
    await accounts.push({ address: address, privateKey: privateKey });
    
  }

  if (accounts[0].address) {
    res.json({ privateKey: accounts[0].privateKey });
  }

  console.log(accounts[0].address);
  /* end restore account */

const pk = new Buffer.from('privateKey', 'hex') // replace by correct private key
const account = wallet.fromPrivateKey(privateKey)
let pvk = account._privKey.toString('hex');
console.log(account);
const password = 'something' // will be required to unlock/sign after importing to a wallet like MyEtherWallet


let keystore = JSON.stringify(
  web3.eth.accounts.encrypt(pvk, password));

  fs.writeFile(
    // 'keystore/keystore.json',
    'keystore/keystore-' + user._id + '.json',
  
    keystore,
     function(err) {
      if (err) console.log(err);
      console.log('Successfully Written to File.');
      // let file = path.join(__dirname + '/keystore/keystore.json');
      let file = __dirname + '/keystore/keystore-' + user._id + '.json';
      console.log("my file="+file);

      res.download(file);

})
});

app.use(express.static(path.join(__dirname, 'public')));
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.listen(8000);




// const pk = new Buffer.from('c87509a1c067bbde78beb793e6fa76530b6382a4c0241e5e4a9ec0a0f44dc0d3', 'hex') // replace by correct private key
// const account = wallet.fromPrivateKey(pk)
// const password = 'something' // will be required to unlock/sign after importing to a wallet like MyEtherWallet
// const json = JSON.stringify(account.toV3(password))

// // writes to a file
// const address = account.getAddress().toString('hex')
// const file = `UTC--${new Date().toISOString().replace(/[:]/g, '-')}--${address}`
// fs.writeFileSync(file, content)


//alley relief dose right proof blouse shoot nephew elbow leaf slow hammer

// fs.writeFile(
//   'keystore/keystore-' + user._id + '.json',
//   user.keystore,
//   function(err) {
//     if (err) console.log(err);
//     console.log('Successfully Written to File.');
//     let file = __dirname + '/keystore/keystore-' + user._id + '.json';
//     res.download(file);
