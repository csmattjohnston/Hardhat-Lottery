const { getNamedAccounts, deployments, ethers, network } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")
const { assert, expect } = require("chai")
/**
 * @title This test is for local testing
 */
!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Unit Tests", function () {
          //contracts to deploy
          let raffle, vrfCoordinatorV2Mock, entranceFee, deployer, interval
          const chainId = network.config.chainId
          //deploy contracts
          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              //deploy all contracts using the "all" tag from the deploy scripts
              await deployments.fixture(["all"])
              //get contracts from ethers
              raffle = await ethers.getContract("Raffle", deployer)
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
              entranceFee = await raffle.getEntranceFee()
              interval = await raffle.getInterval()
          })
          /**Constructor */
          describe("Constructor", function () {
              it("Initializes the raffle correctly", async function () {
                  const raffleState = await raffle.getRaffleState()
                  assert.equal(raffleState.toString(), "0")
              })
              it("Initializes interval correclty", async function () {
                  assert.equal(interval.toString(), networkConfig[chainId]["interval"])
              })
          })
          /**Enter Raffle */
          describe("enterRaffle", function () {
              it("Reverts when you dont pay enough", async function () {
                  await expect(raffle.enterRaffle()).to.be.revertedWith(
                      "Raffle__NotEnoughETHEntered"
                  )
              })
              it("Records players when they enter", async function () {
                  await raffle.enterRaffle({ value: entranceFee })
                  const playerFromContract = await raffle.getPlayer(0)
                  assert.equal(playerFromContract, deployer)
              })
              it("emits event on enter", async function () {
                  await expect(raffle.enterRaffle({ value: entranceFee })).to.emit(
                      raffle,
                      "RaffleEnter"
                  )
              })
              it("Doesnt allow entrance when raffle is calculating", async function () {
                  await raffle.enterRaffle({ value: entranceFee })
                  //This is HH logic to increase evm time by the interval amount
                  //https://hardhat.org/hardhat-network/docs/reference#special-testing/debugging-methods
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  //mine an extra block
                  await network.provider.send("evm_mine", [])
                  //run performUpkeep since all the booleans are true
                  await raffle.performUpkeep([])
                  await expect(raffle.enterRaffle({ value: entranceFee })).to.be.revertedWith(
                      "Raffle__NotOpen"
                  )
              })
          })
          /** Check Up Keep */
          describe("checkUpkeep", function () {
              it("returns false if people havent sent any ETH", async function () {
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  //mine an extra block
                  await network.provider.send("evm_mine", [])
                  //callStatic is used to simulate a function call instead of transacting
                  const { upKeepNeeded } = await raffle.checkUpkeep([])
                  assert(!upKeepNeeded)
              })
              it("returns false when raffle isnt open", async function () {
                  await raffle.enterRaffle({ value: entranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  //0x is a blank byte object
                  await raffle.performUpkeep("0x")
                  const raffleState = await raffle.getRaffleState()
                  const { upKeepNeeded } = await raffle.checkUpkeep("0x")
                  assert.equal(raffleState.toString() == "1", upKeepNeeded == false)
              })
              it("returns false if enough time hasn't passed", async () => {
                  await raffle.enterRaffle({ value: entranceFee })
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upKeepNeeded } = await raffle.checkUpkeep("0x")
                  assert(!upKeepNeeded)
              })
              it("returns true if enough time has passed, has players, eth, and is open", async () => {
                  await raffle.enterRaffle({ value: entranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upKeepNeeded } = await raffle.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(upKeepNeeded)
              })
          })

          describe("performUpKeep", function () {
              it("Can only run if checkUpkeep is true", async function () {
                  await raffle.enterRaffle({ value: entranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const tx = await raffle.performUpkeep([])
                  assert(tx)
              })
              it("Reverts when checkUpkeep is false", async function () {
                  await expect(raffle.performUpkeep([])).to.be.revertedWith(
                      "Raffle_UpKeepNotNeeded"
                  )
              })
              it("updates the raffle state, emits an event and calls vrf coordinator", async function () {
                  await raffle.enterRaffle({ value: entranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const tx = await raffle.performUpkeep([])
                  const txReceipt = await tx.wait(1)
                  //events[0] is taken from the vrfCoordinatorV2Mock requestRandomWords event
                  //event[1] would have been taken from Raffle.sol RequestedRaffleWinner event because it is triggered AFTER the previous event
                  const requestId = txReceipt.events[1].args.requestId
                  const raffleState = await raffle.getRaffleState()
                  assert(requestId.toNumber() > 0)
                  assert(raffleState.toString() == "1")
              })
          })

          describe("fulfillRandomWords", function () {
              beforeEach(async function () {
                  await raffle.enterRaffle({ value: entranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
              })
              it("Can only be called after performUpkeep", async function () {
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)
                  ).to.be.revertedWith("nonexistent request")
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address)
                  ).to.be.revertedWith("nonexistent request")
              })
              it("picks a winner, resets the lottery, and sends money", async function () {
                  //4 accounts total
                  const additionalEntrants = 3
                  const startingAccountIndex = 1 //deployer =0
                  const accounts = await ethers.getSigners()
                  //create random accounts for testing
                  for (
                      let i = startingAccountIndex;
                      i < startingAccountIndex + additionalEntrants;
                      i++
                  ) {
                      const accountConnectedRaffle = raffle.connect(accounts[i])
                      await accountConnectedRaffle.enterRaffle({ value: entranceFee })
                  }
                  //get starting timestamp
                  const startingTimeStamp = await raffle.getLatestTimestamp()

                  //set up a listener for "WinnerPicked" event from Raffle.sol fulfillRandomWords function
                  await new Promise(async (resolve, reject) => {
                      // use a try catch for the listener
                      //there is a timeout of 200000 ms in hardhat.config.js that will trigger if this takes too long
                      raffle.once("WinnerPicked", async () => {
                          console.log("found WinnerPicked event")
                          try {
                              const recentWinner = await raffle.getRecentWinner()
                              console.log(recentWinner)
                              console.log("------------------------")
                              //   console.log(accounts[0].address)
                              //   console.log(accounts[1].address)
                              //   console.log(accounts[2].address)
                              //   console.log(accounts[3].address)

                              //after winner is determined, hardcoded [1] for accounts to get balance. Used the console.log() to determine who the winner is
                              const winnerEndingBalance = await accounts[1].getBalance()
                              const raffleState = await raffle.getRaffleState()
                              const endingTimestamp = await raffle.getLatestTimestamp()
                              const numPlayers = await raffle.getNumPlayers()

                              //split up into different "it"s
                              assert.equal(numPlayers.toString(), "0")
                              assert.equal(raffleState.toString(), "0")
                              assert(endingTimestamp > startingTimeStamp)
                              //assert the correct ending balance
                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance.add(
                                      entranceFee
                                          .mul(additionalEntrants)
                                          .add(entranceFee)
                                          .toString()
                                  )
                              )
                          } catch (e) {
                              reject(e)
                          }
                          resolve()
                      })
                      //draw a random number
                      const tx = await raffle.performUpkeep([])
                      const txReceipt = await tx.wait(1)
                      const winnerStartingBalance = await accounts[1].getBalance()
                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          txReceipt.events[1].args.requestId,
                          raffle.address
                      )
                  })
              })
          })
      })
