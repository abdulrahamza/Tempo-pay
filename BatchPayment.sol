// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @dev Interface of the TIP-20 standard as defined in the EIP.
 */
interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}

/**
 * @title BatchPayment
 * @dev Allows paying multiple recipients in a single transaction with a convenience fee.
 */
contract BatchPayment {
    address public owner;
    uint256 public fee; // Fee amount in the token itself (or could be 0)

    event BatchTransfer(address indexed sender, address indexed token, uint256 totalAmount, uint256 feePaid);
    event FeeUpdated(uint256 newFee);
    event OwnerUpdated(address newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    constructor(uint256 _fee) {
        owner = msg.sender;
        fee = _fee;
    }

    /**
     * @dev Batch transfer tokens to multiple recipients.
     * @param tokenAddress The address of the TIP-20 token.
     * @param recipients Array of recipient addresses.
     * @param amounts Array of amounts to send to each recipient.
     */
    function batchTransfer(address tokenAddress, address[] calldata recipients, uint256[] calldata amounts) external {
        require(recipients.length == amounts.length, "Arrays length mismatch");
        require(recipients.length > 0, "No recipients");

        IERC20 token = IERC20(tokenAddress);
        uint256 totalAmount = 0;

        for (uint256 i = 0; i < amounts.length; i++) {
            totalAmount += amounts[i];
        }

        // Calculate total required including fee
        uint256 totalRequired = totalAmount + fee;

        // Transfer tokens from sender to this contract
        require(token.transferFrom(msg.sender, address(this), totalRequired), "TransferFrom failed");

        // Distribute to recipients
        for (uint256 i = 0; i < recipients.length; i++) {
            require(token.transfer(recipients[i], amounts[i]), "Transfer to recipient failed");
        }

        // Collect fee
        if (fee > 0) {
            require(token.transfer(owner, fee), "Fee transfer failed");
        }

        emit BatchTransfer(msg.sender, tokenAddress, totalAmount, fee);
    }

    /**
     * @dev Updates the convenience fee.
     * @param _newFee New fee amount.
     */
    function setFee(uint256 _newFee) external onlyOwner {
        fee = _newFee;
        emit FeeUpdated(_newFee);
    }

    /**
     * @dev Transfers ownership of the contract.
     * @param _newOwner New owner address.
     */
    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Invalid owner");
        owner = _newOwner;
        emit OwnerUpdated(_newOwner);
    }
}
