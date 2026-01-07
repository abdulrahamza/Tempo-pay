// Contract Configuration
const BATCH_PAYMENT_ADDRESS = "0xc1AD5414f3dE089F47A00736Bf5990cAC7aC05e5";

const ERC20_ABI = [
    "function decimals() view returns (uint8)",
    "function approve(address spender, uint256 amount) public returns (bool)",
    "function allowance(address owner, address spender) public view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)"
];

const BATCH_ABI = [
    "function batchTransfer(address tokenAddress, address[] recipients, uint256[] amounts) external",
    "function fee() view returns (uint256)"
];

// State
let provider, signer, userAddress;
let batchContract;

// DOM Elements
const connectBtn = document.getElementById('connectBtn');
const tokenAddressInput = document.getElementById('tokenAddress');
const csvInput = document.getElementById('csvInput');
const totalTokensDisplay = document.getElementById('totalTokens');
const approveBtn = document.getElementById('approveBtn');
const payBtn = document.getElementById('payBtn');
const statusDiv = document.getElementById('status');

// Helper: Log Status
function setStatus(msg, type = 'info') {
    statusDiv.innerText = msg;
    statusDiv.style.borderLeftColor = type === 'error' ? '#ef4444' : '#6366f1';
    console.log(`[${type.toUpperCase()}] ${msg}`);
}

// 1. Connect Wallet
connectBtn.addEventListener('click', async () => {
    if (!window.ethereum) return setStatus("Please install MetaMask!", 'error');

    try {
        provider = new ethers.providers.Web3Provider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        signer = provider.getSigner();
        userAddress = await signer.getAddress();
        
        // Update UI
        connectBtn.innerText = `${userAddress.substring(0,6)}...${userAddress.substring(38)}`;
        connectBtn.classList.add('connected');
        approveBtn.disabled = false;
        
        // Init Contract
        batchContract = new ethers.Contract(BATCH_PAYMENT_ADDRESS, BATCH_ABI, signer);
        
        setStatus("Wallet connected. Ready to configure.");
    } catch (err) {
        setStatus("Connection failed: " + err.message, 'error');
    }
});

// 2. Parse Input & Calculate Total
function parseData() {
    const raw = csvInput.value.trim();
    if (!raw) return { recipients: [], amounts: [], totalStr: "0" };

    const lines = raw.split('\n');
    const recipients = [];
    const amounts = [];
    let total = ethers.BigNumber.from(0);

    // We assume 18 decimals by default for the preview, real decimals fetched later
    lines.forEach(line => {
        const parts = line.split(',');
        if (parts.length >= 2) {
            const addr = parts[0].trim();
            const val = parts[1].trim();
            if (ethers.utils.isAddress(addr) && !isNaN(val)) {
                recipients.push(addr);
                amounts.push(val); // Keep as string first
            }
        }
    });

    return { recipients, amounts };
}

// Update Total Preview
csvInput.addEventListener('input', () => {
    const { amounts } = parseData();
    const sum = amounts.reduce((a, b) => a + parseFloat(b || 0), 0);
    totalTokensDisplay.innerText = sum;
});

// 3. Approve Tokens
approveBtn.addEventListener('click', async () => {
    const tokenAddr = tokenAddressInput.value.trim();
    if (!ethers.utils.isAddress(tokenAddr)) return setStatus("Invalid Token Address", 'error');

    const { recipients, amounts } = parseData();
    if (recipients.length === 0) return setStatus("No valid recipients", 'error');

    try {
        setStatus("Checking Token...");
        const tokenContract = new ethers.Contract(tokenAddr, ERC20_ABI, signer);
        const decimals = await tokenContract.decimals();
        
        // Calculate Total Wei
        let totalWei = ethers.BigNumber.from(0);
        const amountsWei = amounts.map(a => {
            const val = ethers.utils.parseUnits(a, decimals);
            totalWei = totalWei.add(val);
            return val;
        });
        
        // Get Fee
        const fee = await batchContract.fee();
        const totalRequired = totalWei.add(fee);

        setStatus(`Approving ${ethers.utils.formatUnits(totalRequired, decimals)} tokens...`);
        
        const tx = await tokenContract.approve(BATCH_PAYMENT_ADDRESS, totalRequired);
        setStatus("Approving... Waiting for confirmation");
        await tx.wait();
        
        setStatus("Approved! You can now Batch Pay.");
        payBtn.disabled = false;
        
        // Store parsed data for next step to avoid re-parsing
        window.parsedBatchData = { recipients, amountsWei, tokenAddr };

    } catch (err) {
        setStatus("Approval failed: " + err.message, 'error');
    }
});

// 4. Batch Pay
payBtn.addEventListener('click', async () => {
    if (!window.parsedBatchData) return setStatus("Please Approve first", 'error');
    
    const { tokenAddr, recipients, amountsWei } = window.parsedBatchData;

    try {
        setStatus("Sending transaction...");
        const tx = await batchContract.batchTransfer(tokenAddr, recipients, amountsWei);
        
        setStatus(`Transaction sent: ${tx.hash}. Waiting...`);
        await tx.wait();
        
        setStatus("Batch Payment Successful! 🚀");
        payBtn.disabled = true;
        
    } catch (err) {
        setStatus("Payment failed: " + err.message, 'error');
    }
});
