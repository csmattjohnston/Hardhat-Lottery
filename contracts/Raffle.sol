//Raffle
//Enter lottery (paid)
//pick a random winner (chainlink oracle)
//winner to be selected every x minutes -> automated (chainlink keeper)

//SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

/** Imports */
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/KeeperCompatible.sol";

/** Errors*/
error Raffle__NotEnoughETHEntered();
error Raffle__TransferFailed();
error Raffle__NotOpen();
error Raffle_UpKeepNotNeeded(uint256 currentBalance, uint256 numPlayer, uint256 raffleState);

/**@title A sample Raffle contract
 * @author Matt Johnston
 * @notice This contract is for creating and untamperable decentrialized smart contract
 * @dev this implements Chainlin VRF v2 and Chainlink Keepers
 */
contract Raffle is VRFConsumerBaseV2, KeeperCompatibleInterface {
    /** Type declarations */
    enum RaffleState {
        OPEN,
        CALCULATING
    }
    /** State Variables*/
    uint256 private immutable i_entranceFee;
    address payable[] private s_players;
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
    bytes32 private immutable i_gasLane;
    uint64 private immutable i_subscriptionId;
    uint16 private constant BLOCK_CONFIRMATIONS = 3;
    uint32 private immutable i_callBackGasLimit;
    uint32 private constant NUM_WORDS = 1;
    uint256 private s_lastTimeStamp;
    uint256 private immutable i_interval;
    /** Lottery Variables */
    address private s_recentWinner;
    RaffleState private s_raffleState;

    /** Events */
    event RaffleEnter(address indexed player);
    event RequestedRaffleWinner(uint256 indexed requestId);
    event WinnerPicked(address indexed winner);

    /** Constructor */
    constructor(
        address vrfCoordinatorV2,
        uint256 _entranceFee,
        bytes32 gasLane,
        uint64 subscriptionId,
        uint32 callbackGasLimit,
        uint256 interval
    ) VRFConsumerBaseV2(vrfCoordinatorV2) {
        i_entranceFee = _entranceFee;
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        i_gasLane = gasLane;
        i_subscriptionId = subscriptionId;
        i_callBackGasLimit = callbackGasLimit;
        s_raffleState = RaffleState.OPEN;
        s_lastTimeStamp = block.timestamp;
        i_interval = interval;
    }

    /** Functionality */
    function enterRaffle() public payable {
        if (msg.value < i_entranceFee) {
            revert Raffle__NotEnoughETHEntered();
        }
        if (s_raffleState != RaffleState.OPEN) {
            revert Raffle__NotOpen();
        }
        s_players.push(payable(msg.sender));
        emit RaffleEnter(msg.sender);
    }

    /**
     * @dev This is the function that the chainlink keeper nodes call
     * they look for the 'upkeepNeeded' to return true
     * the following should be true to return true
     * 1. Our time interval should have passed
     * 2. The lottery should have at least 1 player
     * 3. Should have some ETH
     * 4. Subscription is fuded with LINK
     * 5. the lottery should be in an open state
     */
    function checkUpkeep(
        bytes memory /* checkData */
    )
        public
        view
        override
        returns (
            bool upKeepNeeded,
            bytes memory /*performData*/
        )
    {
        bool isOpen = (RaffleState.OPEN == s_raffleState);
        bool timePassed = ((block.timestamp - s_lastTimeStamp) > i_interval);
        bool hasPlayer = (s_players.length > 0);
        bool hasBalance = address(this).balance > 0;
        upKeepNeeded = (isOpen && timePassed && hasPlayer && hasBalance);
    }

    function performUpkeep(
        bytes calldata /* performData */
    ) external override {
        //Request random number
        //once we get it, do something
        (bool upKeepNeeded, ) = checkUpkeep("");
        if (!upKeepNeeded) {
            revert Raffle_UpKeepNotNeeded(
                address(this).balance,
                s_players.length,
                uint256(s_raffleState)
            );
        }
        s_raffleState = RaffleState.CALCULATING;
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_gasLane,
            i_subscriptionId,
            BLOCK_CONFIRMATIONS,
            i_callBackGasLimit,
            NUM_WORDS
        );
        //the emit below is redundant because requestRandomWords() from vrfCoordinatorV2Mock already emits an event with the request id
        emit RequestedRaffleWinner(requestId);
    }

    function fulfillRandomWords(
        uint256, /*requestId*/
        uint256[] memory randomWords
    ) internal override {
        //modulo to get a random player from the random word
        uint256 indexOfWinner = randomWords[0] % s_players.length;
        address payable recentWinner = s_players[indexOfWinner];
        s_recentWinner = recentWinner;
        (bool success, ) = recentWinner.call{value: address(this).balance}("");
        if (!success) {
            revert Raffle__TransferFailed();
        }
        s_raffleState = RaffleState.OPEN;
        s_players = new address payable[](0);
        s_lastTimeStamp = block.timestamp;
        emit WinnerPicked(recentWinner);
    }

    /** Getters */
    function getEntranceFee() public view returns (uint256) {
        return i_entranceFee;
    }

    function getRecentWinner() public view returns (address) {
        return s_recentWinner;
    }

    function getInterval() public view returns (uint256) {
        return i_interval;
    }

    function getPlayer(uint256 index) public view returns (address) {
        return s_players[index];
    }

    function getRaffleState() public view returns (RaffleState) {
        return s_raffleState;
    }

    function getNumWords() public pure returns (uint256) {
        return NUM_WORDS;
    }

    function getNumPlayers() public view returns (uint256) {
        return s_players.length;
    }

    function getLatestTimestamp() public view returns (uint256) {
        return s_lastTimeStamp;
    }

    function getRequestBlockConfirmations() public pure returns (uint256) {
        return BLOCK_CONFIRMATIONS;
    }
}
