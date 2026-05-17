// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract ArenSwap {
    address public immutable usdc;
    address public immutable eurc;
    uint256 public swapRate;
    address public owner;

    event Swapped(
        address indexed caller,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    event LiquidityDeposited(
        address indexed token,
        uint256 amount
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "ArenSwap: caller is not the owner");
        _;
    }

    constructor(address _usdc, address _eurc) {
        usdc = _usdc;
        eurc = _eurc;
        owner = msg.sender;
    }

    function setSwapRate(uint256 newRate) external onlyOwner {
        require(newRate > 0, "ArenSwap: rate must be greater than zero");
        swapRate = newRate;
    }

    function swapUSDCToEURC(uint256 usdcAmount) external {
        require(usdcAmount > 0, "ArenSwap: amount must be greater than zero");
        require(swapRate > 0, "ArenSwap: swap rate not set");
        uint256 eurcOut = usdcAmount * swapRate / 1e6;
        require(IERC20(eurc).balanceOf(address(this)) >= eurcOut, "ArenSwap: insufficient EURC reserve");
        IERC20(usdc).transferFrom(msg.sender, address(this), usdcAmount);
        IERC20(eurc).transfer(msg.sender, eurcOut);
        emit Swapped(msg.sender, usdc, eurc, usdcAmount, eurcOut);
    }

    function swapEURCToUSDC(uint256 eurcAmount) external {
        require(eurcAmount > 0, "ArenSwap: amount must be greater than zero");
        require(swapRate > 0, "ArenSwap: swap rate not set");
        uint256 usdcOut = eurcAmount * 1e6 / swapRate;
        require(IERC20(usdc).balanceOf(address(this)) >= usdcOut, "ArenSwap: insufficient USDC reserve");
        IERC20(eurc).transferFrom(msg.sender, address(this), eurcAmount);
        IERC20(usdc).transfer(msg.sender, usdcOut);
        emit Swapped(msg.sender, eurc, usdc, eurcAmount, usdcOut);
    }

    function depositUSDC(uint256 amount) external onlyOwner {
        require(amount > 0, "ArenSwap: amount must be greater than zero");
        IERC20(usdc).transferFrom(msg.sender, address(this), amount);
        emit LiquidityDeposited(usdc, amount);
    }

    function depositEURC(uint256 amount) external onlyOwner {
        require(amount > 0, "ArenSwap: amount must be greater than zero");
        IERC20(eurc).transferFrom(msg.sender, address(this), amount);
        emit LiquidityDeposited(eurc, amount);
    }

    function withdrawUSDC(uint256 amount) external onlyOwner {
        IERC20(usdc).transfer(msg.sender, amount);
    }

    function withdrawEURC(uint256 amount) external onlyOwner {
        IERC20(eurc).transfer(msg.sender, amount);
    }
}