import _ from 'lodash-es';
import { wallet, CONST } from '@cityofzion/neon-js';
import { ALLOWED_NEWTORKS, REWARD_CONTRACT_ADDRESS, SUBSCRIPTION_ADDRESS } from './constants';

let neoline: any;
let neolineN3: any;

interface DapiError {
  type: string;
  description: string;
  data: string;
}

interface TransferResponse {
  txid: string;
  nodeURL?: string;
  signedTx?: string;
}

interface BalanceResponse {
  contract: string;
  symbol: string;
  amount: string;
}

interface PublicKeyResponse {
  address: string;
  publicKey: string;
}

interface AccountInfo {
  address: string;
  label?: string;
}

interface Network {
  networks: string[];
  chainId: number;
  defaultNetwork: string;
}

interface TransactionConfirmedResponseEvent {
  chainId: number;
  txid: string;
  blockHeight: number;
  blockTime: number;
}

const checkNetwork = (network: string, hide?: boolean) => {
  if (!ALLOWED_NEWTORKS.includes(network)) {
    if (!hide)
      alert('Network not supported, please switch');
    return false;
  }
  return true;
};

const initDapi = (options?: any) => {
  const onReady = _.once(async () => {
    if (!neoline || !neolineN3) {
      neoline = new window.NEOLine.Init();
      neolineN3 = new window.NEOLineN3.Init();
    }
    neoline?.addEventListener(neoline.EVENT.DISCONNECTED, () => {
      disconnect();
    });
    neoline?.addEventListener(neoline.EVENT.ACCOUNT_CHANGED, (result: AccountInfo) => {
      getBalance(result.address);
    });
    if (sessionStorage.getItem('connect') === 'true' && sessionStorage.getItem('preConnectWallet') === 'Neoline') {
      getAccount();
    }
  });
  if (window.NEOLine && window.NEOLineN3) {
    onReady();
    return;
  }
  window.addEventListener('NEOLine.NEO.EVENT.READY', () => {
    if (window.NEOLine && window.NEOLineN3) {
      onReady();
    }
  });
  window.addEventListener('NEOLine.N3.EVENT.READY', () => {
    if (window.NEOLine && window.NEOLineN3) {
      onReady();
    }
  });
};

const checkWalletExtension = () => {
  return !!neoline;
};

const getAccount = async () => {
  return new Promise((resolve, reject) => {
    neoline
      ?.getAccount()
      .then(async (account: AccountInfo) => {
        sessionStorage.setItem('preConnectWallet', 'Neoline');
        await getBalance(account.address);
        resolve(account.address);
      })
      .catch((error: DapiError) => reject(convertWalletError(error)));
  });
};

const getNetworks = () => {
  return new Promise((resolve, reject) => {
    neoline
      ?.getNetworks()
      .then((result: Network) => {
        return resolve(result.networks);
      })
      .catch((error: DapiError) => {
        return reject(convertWalletError(error));
      });
  });
};

const getDefaultNetwork = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    neoline
      ?.getNetworks()
      .then((result: Network) => {
        return resolve(result.defaultNetwork);
      })
      .catch((error: DapiError) => {
        return reject(convertWalletError(error));
      });
  });
};

const getApplicationLog = async (txid: string) => {
  let status = '';
  let retryCount = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await neolineN3
      ?.getApplicationLog({
        txid
      })
      .then((result: any) => {
        if (result?.executions?.[0]?.vmstate) {
          status = result.executions[0].vmstate === 'HALT' ? 'success' : 'error';
        } else {
          status = 'pending';
        }
      })
      .catch((error: DapiError) => {
        convertWalletError(error);
        status = 'catchErr';
      });
    if (status === 'catchErr' || status === 'pending') {
      retryCount += 1;
      continue;
    }
    break;
  }
  return status;
};

const getBalance = async (address: string) => {
  return new Promise((resolve, reject) => {
    neolineN3
      ?.getBalance()
      .then((result: { [addr: string]: BalanceResponse[] }) => {
        const balance: { [asset: string]: string } = {};
        result[address]?.forEach((v) => {
          balance[v.symbol.toUpperCase()] = v.amount;
        });
        return resolve(balance);
      })
      .catch((error: DapiError) => reject(convertWalletError(error)));
  });
};

const transfer = async (address: string, amount: number) => {
  return new Promise((resolve) => {
    neolineN3
      ?.invoke({
        scriptHash: CONST.NATIVE_CONTRACT_HASH.GasToken,
        operation: 'transfer',
        args: [
          {
            type: 'Address',
            value: address
          },
          {
            type: 'Address',
            value: SUBSCRIPTION_ADDRESS
          },
          {
            type: 'Integer',
            value: amount
          },
          {
            type: 'Any',
            value: null
          }
        ],
        fee: '0',
        broadcastOverride: false,
        signers: [
          {
            account: `0x${wallet.getScriptHashFromAddress(address)}`,
            scopes: 1
          }
        ]
      })
      .then((result: TransferResponse) => {
        return { txid: result.txid };
      })
      .catch((error: DapiError) => {
        const err = convertWalletError(error);
        return { txid: null, err };
      })
      .then(async ({ txid, err }) => {
        if (!txid && err) {
          return resolve({ status: 'error', err });
        } else {
          const status = await getApplicationLog(txid);
          return resolve({
            status,
            txid
          });
        }
      });
  });
};

const storeRewards = async (address: string, amount: number, reward_id: string) => {
  const addressHash = `0x${wallet.getScriptHashFromAddress(address)}`;
  // const reward_id = `${addressHash.substring(0, 16)}${uid}`.toLowerCase();
  return new Promise((resolve) => {
    neolineN3
      ?.invoke({
        scriptHash: CONST.NATIVE_CONTRACT_HASH.GasToken,
        operation: 'transfer',
        args: [
          {
            type: 'Address',
            value: address
          },
          {
            type: 'Address',
            value: REWARD_CONTRACT_ADDRESS
          },
          {
            type: 'Integer',
            value: amount
          },
          {
            type: 'String',
            value: reward_id.toLowerCase()
          }
        ],
        fee: '0',
        broadcastOverride: false,
        signers: [
          {
            account: addressHash,
            scopes: 'CalledByEntry'
          }
        ]
      })
      .then((result: TransferResponse) => {
        return { txid: result.txid };
      })
      .catch((error: DapiError) => {
        const err = convertWalletError(error);
        return { txid: null, err };
      })
      .then(async ({ txid, err }) => {
        if (!txid && err) {
          return resolve({ status: 'error', err });
        } else {
          const status = await getApplicationLog(txid);
          return resolve({
            status,
            txid,
            reward_id
          });
        }
      });
  });
};

const submitCitizens = async (address: string) => {
  return new Promise((resolve) => {
    neolineN3
      ?.invoke({
        scriptHash: `0x${wallet.getScriptHashFromAddress(REWARD_CONTRACT_ADDRESS)}`,
        operation: 'submitCitizens',
        args: [
          {
            type: 'ByteArray',
            value: '0x1ade71963cf84ce29856891bedd12e42'
          },
          {
            type: 'Array',
            value: [
              { type: 'String', value: 'NKyFLYHdGr77xFrPdffjGCK5kaqqECoJE9' },
              { type: 'String', value: 'NgBjH3Pu7791CR5XU1vtYatvC9ouq9DCL6' }
            ]
          }
        ],
        fee: '0',
        broadcastOverride: true,
        signers: [
          {
            account: `0x${wallet.getScriptHashFromAddress(address)}`,
            scopes: 1
          }
        ]
      })
      .then((result: TransferResponse) => {
        return { txid: result.txid };
      })
      .catch((error: DapiError) => {
        const err = convertWalletError(error);
        return { txid: null, err };
      })
      .then(async ({ txid, err }) => {
        if (!txid && err) {
          return resolve({ status: 'error', err });
        } else {
          const status = await getApplicationLog(txid);
          return resolve({
            status,
            txid
          });
        }
      });
  });
};

const getPublicKey = () => {
  return new Promise((resolve, reject) => {
    neoline
      ?.getPublicKey()
      .then((publicKeyData: PublicKeyResponse) => {
        return resolve(publicKeyData?.publicKey || '');
      })
      .catch((error: DapiError) => {
        return reject(convertWalletError(error));
      });
  });
};

const disconnect = () => {
  sessionStorage.removeItem('connect');
  sessionStorage.removeItem('preConnectWallet');
};

const convertWalletError = (error: DapiError) => {
  switch (error.type) {
    case 'NO_PROVIDER':
      return 'No provider available.';
    case 'CONNECTION_DENIED':
      return 'The user rejected the request to connect with your dApp';
    case 'CONNECTION_REFUSED':
      return 'The user rejected the request to connect with your dApp';
    case 'RPC_ERROR':
      return 'There was an error when broadcasting this transaction to the network.';
    case 'MALFORMED_INPUT':
      return 'The receiver address provided is not valid.';
    case 'CANCELED':
      return 'The user has cancelled this transaction.';
    case 'INSUFFICIENT_FUNDS':
      return 'The user has insufficient funds to execute this transaction.';
    case 'CHAIN_NOT_MATCH':
      return 'The currently opened chain does not match the type of the call chain, please switch the chain.';
    default:
      console.error(error);
      break;
  }
};

export {
  initDapi,
  getAccount,
  disconnect,
  getDefaultNetwork,
  getPublicKey,
  getNetworks,
  transfer,
  getBalance,
  storeRewards,
  submitCitizens,
  checkWalletExtension
};
