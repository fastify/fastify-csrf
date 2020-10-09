'use strict'

const fp = require('fastify-plugin')
const CSRF = require('csrf')
const { Forbidden } = require('http-errors')

async function csrfPlugin (fastify, opts) {
  const tokens = new CSRF()

  const cookieKey = opts.cookieKey || '_csrf'
  const cookieOpts = opts.cookieOpts || { path: '/', sameSite: true }
  const sessionKey = opts.sessionKey || '_csrf'
  const getToken = opts.getToken || getTokenDefault
  const sessionPlugin = opts.sessionPlugin || null

  if (sessionPlugin === 'fastify-secure-session') {
    fastify.decorateReply('generateCsrf', generateCsrfSecureSession)
  } else if (sessionPlugin === 'fastify-session') {
    fastify.decorateReply('generateCsrf', generateCsrfSession)
  } else {
    fastify.decorateReply('generateCsrf', generateCsrfCookie)
  }

  fastify.decorate('csrfProtection', csrfProtection)

  async function generateCsrfCookie (opts) {
    let secret = this.request.cookies[cookieKey]
    if (!secret) {
      secret = await tokens.secret()
      this.setCookie(cookieKey, secret, Object.assign({}, cookieOpts, opts))
    }
    return tokens.create(secret)
  }

  async function generateCsrfSecureSession () {
    let secret = this.request.session.get(sessionKey)
    if (!secret) {
      secret = await tokens.secret()
      this.request.session.set(sessionKey, secret)
    }
    return tokens.create(secret)
  }

  async function generateCsrfSession () {
    let secret = this.request.session[sessionKey]
    if (!secret) {
      secret = await tokens.secret()
      this.request.session[sessionKey] = secret
    }
    return tokens.create(secret)
  }

  function csrfProtection (req, reply, next) {
    const secret = getSecret(req)
    if (!secret) {
      req.log.warn('Missing csrf secret')
      return reply.send(new Forbidden('Missing csrf secret'))
    }
    if (!tokens.verify(secret, getToken(req))) {
      req.log.warn('Invalid csrf token')
      return reply.send(new Forbidden('Invalid csrf token'))
    }
    next()
  }

  function getSecret (req) {
    if (sessionPlugin === 'fastify-secure-session') {
      return req.session.get(sessionKey)
    } else if (sessionPlugin === 'fastify-session') {
      return req.session[sessionKey]
    } else {
      return req.cookies[cookieKey]
    }
  }
}

function getTokenDefault (req) {
  return (req.body && req.body._csrf) ||
    (req.query && req.query._csrf) ||
    req.headers['csrf-token'] ||
    req.headers['xsrf-token'] ||
    req.headers['x-csrf-token'] ||
    req.headers['x-xsrf-token']
}

module.exports = fp(csrfPlugin, {
  fastify: '>=3.0.0',
  name: 'fastify-csrf',
  dependencies: ['fastify-cookie']
})
