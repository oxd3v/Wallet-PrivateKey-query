const zerionApiKeys = ['zk_dev_48d3b1b9806a4337a4899a0ffbd1963e', 'zk_dev_5e74b20163454e0e89ee2cf1c9f86709']
const getPortfolioValue = async (walletAddress, chains = ['eth','arbitrum', 'base', 'avalanche']) => {
    const options = {
        method: 'GET',
        headers: {
            accept: 'application/json',
            'X-API-Key': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6ImRmMWQwNWE3LTNhNzgtNGI5MS1hY2RlLTM3NDRhYzk5MDlkMyIsIm9yZ0lkIjoiNDYwNDMwIiwidXNlcklkIjoiNDczNjk0IiwidHlwZUlkIjoiNjcwMzUyNTYtMmFjNy00Y2RkLTlhNWUtNzg5Mzk3M2Q4YTNlIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NTMwNzI1MjAsImV4cCI6NDkwODgzMjUyMH0.9S6iiFYuFjY13FNSHZK_rmvy0HDiNU6DaDZpTtJZK1o'
        },
    };

    const url = new URL(`https://deep-index.moralis.io/api/v2.2/wallets/${walletAddress}/net-worth`);
    const params = {
        exclude_spam: 'true',
        exclude_unverified_contracts: 'true',
        max_token_inactivity: '1',
        min_pair_side_liquidity_usd: '1000'
    };
    chains.forEach(chain => url.searchParams.append('chains', chain));
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    let res = await fetch(url, options);
    let data = await res.json();
    console.log(data);
}

const getZerionWalletValue = async (walletAddress)=>{
    const options = {
  method: 'GET',
  headers: {
    accept: 'application/json',
    authorization: 'Basic emtfZGV2XzVlNzRiMjAxNjM0NTRlMGU4OWVlMmNmMWM5Zjg2NzA5OmVnZ25vZ29uc29uaWMzMzA2NTI0NzMx'
  }
};

fetch('https://api.zerion.io/v1/wallets/address/portfolio?filter[positions]=only_simple&currency=usd', options)

}

getPortfolioValue("0x5853ed4f26a3fcea565b3fbc698bb19cdf6deb85")

