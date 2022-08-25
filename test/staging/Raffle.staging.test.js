const { getNamedAccounts, deployments, ethers, network } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")
const { assert, expect } = require("chai")
/**
 * @title This test is for testnets
 */
developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle  Tests", function () {
          //contracts to deploy
          let raffle, entranceFee, deployer

          //deploy contracts
          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              //get contracts from ethers
              raffle = await ethers.getContract("Raffle", deployer)
              entranceFee = await raffle.getEntranceFee()
          })

          describe("fulfillRandomWords", function () {
              it("works with live Chainlink Keepers and Chainlink VRF", async function () {
                  //set up a listener for "WinnerPicked" event from Raffle.sol fulfillRandomWords function
                  const startingTimeStamp = await raffle.getLatestTimestamp()
                  const accounts = await ethers.getSigners()
                  //set up listener before we calculate the starting balance because the blockcahin can move fast
                  await new Promise(async (resolve, reject) => {
                      // use a try catch for the listener
                      //there is a timeout of 200000 ms in hardhat.config.js that will trigger if this takes too long
                      raffle.once("WinnerPicked", async () => {
                          console.log("found WinnerPicked event")
                          try {
                              const recentWinner = await raffle.getRecentWinner()
                              const raffleState = await raffle.getRaffleState()
                              const winnerEndingBalance = await accounts[0].getBalance()
                              const endingTimestamp = await raffle.getLatestTimestamp()

                              await expect(raffle.getPlayer(0)).to.be.reverted
                              assert.equal(recentWinner.toString(), accounts[0].address)
                              assert.equal(raffleState, 0)
                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance.add(entranceFee).toString()
                              )
                              assert(endingTimestamp > startingTimeStamp)
                              resolve()
                          } catch (e) {
                              reject(e)
                          }
                      })
                      console.log("Entering Raffle...")
                      const tx = await raffle.enterRaffle({ value: entranceFee })
                      await tx.wait(1)
                      console.log("Ok, time to wait...")
                      const winnerStartingBalance = await accounts[0].getBalance()
                  })
              })
          })
      })
