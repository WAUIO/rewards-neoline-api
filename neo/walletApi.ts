interface WalletApi {
  Neoline: typeof import('./neolineApi') | null;
}

let walletApi: WalletApi = {
  Neoline: null
};

const initWalletApi = async (options?: any) => {
  import('./neolineApi').then((res) => {
    walletApi.Neoline = res;
    res.initDapi(options);
  });
};

export { initWalletApi, walletApi };
