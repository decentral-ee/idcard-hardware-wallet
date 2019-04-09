require('dotenv').config();
const readlineSync = require('readline-sync');
const pkcs11js = require('pkcs11js');
const crypto = require('crypto');
const PrivateKeyProvider = require('truffle-privatekey-provider');
const Web3 = require('web3');

//const ACCOUNT0_PUBLIC_KEY = Buffer.from('046104E99F8F25F1AFD4BD18AAF4CD2B1770586640636E14707477825662E6FAD5CB0C8E27C5B19A9E718C0503B9CE90005102082B2E148BBEF53B7C88AF3CD75EE667BD502A8FB2BF3F40F919F60E2672B3C8CED895070285079C9A20961F44F10A77', 'hex');
const ACCOUNT0_PUBLIC_KEY = Buffer.from('04E99F8F25F1AFD4BD18AAF4CD2B1770586640636E14707477825662E6FAD5CB0C8E27C5B19A9E718C0503B9CE90005102082B2E148BBEF53B7C88AF3CD75EE667BD502A8FB2BF3F40F919F60E2672B3C8CED895070285079C9A20961F44F10A77', 'hex', 'hex');

async function runWeb3(fn) {
    // init pkcs11
    let provider;
    const pkcs11 = new pkcs11js.PKCS11();
    pkcs11.load(process.env.PKCS11_LIB_PATH);
    pkcs11.C_Initialize();
     
    try {
        // Getting info about PKCS11 Module
        //const module_info = pkcs11.C_GetInfo();

        // find PIN2 ID card slot
        const slots = pkcs11.C_GetSlotList(true);
        let selectedSlot;
        slots.forEach(slot => {
            const tokenInfo = pkcs11.C_GetTokenInfo(slot);
            if (tokenInfo.manufacturerID.startsWith('AS Sertifitseerimiskeskus') && 
                tokenInfo.label.startsWith('PIN1')) {
                selectedSlot = slot;
            }
        });
        if (!selectedSlot) {
            throw new Error('ID card slot not found');
        }

        // create session
        const session = pkcs11.C_OpenSession(selectedSlot, pkcs11js.CKF_RW_SESSION | pkcs11js.CKF_SERIAL_SESSION);

        // login
        console.log('Unlocking wallet...');
        const pin = readlineSync.question('PIN1 pin: ', { hideEchoBack: true, mask: '' });
        pkcs11.C_Login(session, pkcs11js.CKU_USER, pin);

        // get public key
        pkcs11.C_FindObjectsInit(session, [{ type: pkcs11js.CKA_CLASS, value: pkcs11js.CKO_PUBLIC_KEY }]);
        const hPublicKey = pkcs11.C_FindObjects(session);
        if (!hPublicKey) throw new Error('Public key not found');
        pkcs11.C_FindObjectsFinal(session);

        // initialize account0 parameters
        /*console.log('publicKey attrs ', pkcs11.C_GetAttributeValue(session, hPublicKey, [
            { type: pkcs11js.CKA_TOKEN },
            { type: pkcs11js.CKA_CLASS },
            { type: pkcs11js.CKA_KEY_TYPE },
            { type: pkcs11js.CKA_LABEL },
            { type: pkcs11js.CKA_EC_PARAMS },
        ]).map(x=>x.value.toString('hex')));
        publicKeyEC = pkcs11.C_GetAttributeValue(session, hPublicKey, [{ type: pkcs11js.CKA_EC_POINT }])[0].value;
        console.log(pkcs11js.CKO_PUBLIC_KEY, pkcs11js.CKK_EC);
        console.log('publicKeyEC  ', publicKeyEC.length, publicKeyEC.toString('hex'));
        console.log('ACCOUNT0_EC  ', ACCOUNT0_PUBLIC_KEY.length, ACCOUNT0_PUBLIC_KEY.toString('hex'));
        const account0PublicKey = pkcs11.C_CreateObject(session, [
            { type: pkcs11js.CKA_TOKEN, value: false },
            { type: pkcs11js.CKA_CLASS, value: pkcs11js.CKO_PUBLIC_KEY },
            { type: pkcs11js.CKA_KEY_TYPE, value: pkcs11js.CKK_EC },
            //{ type: pkcs11js.CKA_LABEL, value: 'ACCOUNT0_PUBLIC_KEY' },
            { type: pkcs11js.CKA_EC_PARAMS, value: Buffer.from('06052B81040022', 'hex') }, // secp384r1
            { type: pkcs11js.CKA_EC_POINT, value: publicKeyEC },
        ]);*/

        // get private key
        pkcs11.C_FindObjectsInit(session, [{ type: pkcs11js.CKA_CLASS, value: pkcs11js.CKO_PRIVATE_KEY }]);
        const hPrivateKey = pkcs11.C_FindObjects(session);
        if (!hPrivateKey) throw new Error('Private key not found');
        pkcs11.C_FindObjectsFinal(session);

        // derive key
        const dk1 = pkcs11.C_DeriveKey(
            session,
            {
                mechanism: pkcs11js.CKM_ECDH1_DERIVE,
                parameter: {
                    type: pkcs11js.CK_PARAMS_EC_DH,
                    kdf: pkcs11js.CKD_NULL,
                    publicData: ACCOUNT0_PUBLIC_KEY
                },
            },
            hPrivateKey,
            [
                { type: pkcs11js.CKA_TOKEN, value: false },
                { type: pkcs11js.CKA_CLASS, value: pkcs11js.CKO_SECRET_KEY },
                { type: pkcs11js.CKA_KEY_TYPE, value: pkcs11js.CKK_GENERIC_SECRET },
                { type: pkcs11js.CKA_SENSITIVE, value: false },
                { type: pkcs11js.CKA_EXTRACTABLE, value: true },
                { type: pkcs11js.CKA_ENCRYPT, value: true },
                { type: pkcs11js.CKA_DECRYPT, value: true },
                { type: pkcs11js.CKA_UNWRAP, value: true },
                { type: pkcs11js.CKA_WRAP, value: true },
                { type: pkcs11js.CKA_VALUE_LEN, value: 384 / 8 }
            ]
        );
        const privateKey = crypto.createHash('sha256')
               .update(pkcs11.C_GetAttributeValue(session, dk1, [{ type: pkcs11js.CKA_VALUE }])[0].value)
               .digest();
        console.log('Wallet unlocked.');

        // web3
        provider = new PrivateKeyProvider(privateKey, process.env.WEB3_PROVIDER);
        const web3 = new Web3(provider);
        const address = provider.address;
        await fn(web3, address);

        pkcs11.C_Logout(session);
        pkcs11.C_CloseSession(session);
    } catch(e){
        console.error(e);
    } finally {
        if (provider) provider.engine.stop();
        pkcs11.C_Finalize();
    }
}

async function cmdInfo(web3, address) {
    console.log('Ethereum address: ', address);
    console.log('Ethereum balance: ', Number(web3.utils.fromWei(await web3.eth.getBalance(address), 'ether')).toFixed(4));
}

async function cmdSend(web3, address) {
    const to = readlineSync.question('Send to: ');
    if (!web3.utils.isAddress(to)) {
        console.warn('Not a valid address');
        return;
    }
    const amountETH = readlineSync.question('Amount: ');
    const amount = web3.utils.toWei(amountETH, 'ether');
    await web3.eth.sendTransaction({
        from: address,
        to: to,
        value: amount
    });
    console.log('Sent.');
}

// CLI
async function cmdLoop() {
    let quit = false;
    while (!quit) {
        const commands = ['info', 'send', 'quit'];
        const index = readlineSync.keyInSelect(commands, 'Which command: ');
        const command = commands[index];
        switch (command) {
        case 'info':
            await runWeb3(cmdInfo);
            break;
        case 'send':
            await runWeb3(cmdSend);
            break;
        case 'quit':
            quit = true;
            break;
        }
    }
}

async function serverLoop() {
}

cmdLoop();
