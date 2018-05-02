const backend = require('./backend')
const PacketByPacket = require('p-by-p')
const PacketParser = require('./backend/packetparser')
const utils = require('./backend/utils')
const gamestate = require('./backend/gamestate')
const bunchStash = require('./backend/bunchstash')
const CONSTS = require('./backend/constants')
const Cap = require('cap').Cap
const opn = require('opn');

function printUsage () {
  console.log(
    `Usage:
  * node index.js <game_pc_ip>
Example: node index.js 192.168.1.10`
  )
  process.exit(1)
}

function startWebServer () {
  const apiServerPort = 20086
  backend.listen(apiServerPort, () => {
    console.log('Game packets listening on http://localhost:' + apiServerPort);
	console.log('Now, Start the Game!');
	opn('http://localhost:' + apiServerPort);
  })
}

function printStateOnConsole() {
  setInterval(() => {
    console.log(`[${utils.toLocalISOString(new Date())}] - playbackState: ${gamestate.playbackState}, speed: ${gamestate.playbackSpeed}, playbackIndex: ${gamestate.playbackIndex}, processedEvents: ${gamestate.totalProcessedEvents}/${gamestate.playbackEvents.length}`)
  }, 5000)
}

function main () {
  const args = process.argv.slice(2)
  if (args.length < 1) {
    printUsage()
  }
    if (args.length !== 1) {
      printUsage()
    }
    const c = new Cap()
	var device = Cap.findDevice(args[0]);
    const filter = `(src host ${args[0]} and udp dst portrange 7000-7999) or (dst host ${args[0]} and udp src portrange 7000-7999)`
    const bufSize = 10 * 1024 * 1024
    const capBuffer = Buffer.alloc(65535)
    const linkType = c.open(device, filter, bufSize, capBuffer)
    c.setMinBytes && c.setMinBytes(0)
    const parser = PacketParser()
    let pIndex = 0
    c.on('packet', function (nbytes, trunc) {
      // raw packet data === buffer.slice(0, nbytes)
      pIndex++
      const rawPacketData = capBuffer.slice(0, nbytes)
      // one packet can generate 1 or 0 event
      const result = parser.parse(rawPacketData, new Date().getTime(), pIndex)
      if (result != null) {
        // result can only be UEBunch event
		//console.log(result);
        const l2Evts = bunchStash.feedEvent(result)
        if (l2Evts) {
          for (const l2Evt of l2Evts) {
            if (l2Evt.type === CONSTS.EventTypes.ENCRYPTIONKEY) {
              //console.log(`Got EncryptionToken ${l2Evt.data.EncryptionToken}`)
              parser.setEncryptionToken(l2Evt.data.EncryptionToken)
            } else {
              if (l2Evt.type === CONSTS.EventTypes.GAMESTOP) {
                parser.clearEncryptionToken()
              }
			  //console.log(l2Evt);
              gamestate.processPUBGEvent(l2Evt)
            }
          }
        }
      }
    })
    
    startWebServer()
}

main()
