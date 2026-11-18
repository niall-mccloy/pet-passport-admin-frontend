import Hapi from '@hapi/hapi'
import Vision from '@hapi/vision'
import Inert from '@hapi/inert'
import nunjucks from 'nunjucks'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import { submissions } from './routes/submissions.js'

export async function createServer() {
    const server = Hapi.server({
        port: 3002,
        host: 'localhost'
    })

    const require = createRequire(import.meta.url)
    const projectRoot = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '..'
    )
    const viewsPath = path.join(projectRoot, 'src/views')
    const govukRoot = path.join(
        path.dirname(require.resolve('govuk-frontend/package.json')),
        'dist/govuk'
    )

    await server.register([Vision, Inert])

    const environment = nunjucks.configure(
        [viewsPath, path.dirname(govukRoot)],
        { autoescape: true }
    )

    server.views({
        engines: {
            njk: {
                compile(source) {
                    const template = nunjucks.compile(source, environment)
                    return (context) => template.render(context)
                }
            }
        },
        path: viewsPath
    })

    await server.register(submissions)

    server.route([
        {
            method: 'GET',
            path: '/health',
            handler: () => {
                return {
                    status: 'ok'
                }
            }
        },
        {
            method: 'GET',
            path: '/govuk-frontend.css',
            handler: (_request, h) => 
                h.file(path.join(govukRoot, 'govuk-frontend.min.css'))
        },
        {
            method: 'GET',
            path: '/assets/{path*}',
            handler: {
                directory: { path: path.join(govukRoot, 'assets') }
            }
        },
        {
            method: 'GET',
            path: '/',
            handler: (_request, h) =>
                h.view('home', { pageTitle: 'Pet Passport Admin'})
        }
    ])

    server.ext('onPreResponse', (request, h) => {
        const response = request.response
        if (response.isBoom) {
            response.output.headers['cache-control'] = 'no-store'
        } else {
            response.header('Cache-Control', 'no-store')
        }
        return h.continue
    })

    server.events.on('request', (_request, event, tags) => {
        if (tags.error) {
            console.error(event.error)
        }
    })

    return server
}

if (import.meta.main){
    const server = await createServer()
    for (const signal of ['SIGINT', 'SIGTERM']){
        process.once(signal, () => {
            server.stop({ timeout: 10000}).catch((error) => {
                console.error(error)
                process.exitCode = 1
            })
        })
    }
    await server.start()
    console.log(`Server running at: ${server.info.uri}`)
}