process.env.HOSTNAME = '127.0.0.1'
process.env.PORT ||= '8100'

await import('./server.js')
