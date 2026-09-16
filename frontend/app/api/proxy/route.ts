import { NextRequest, NextResponse } from 'next/server'
import { enqueueItem } from '@/lib/nonceReserver'
import { cacheResponse, getCreditsSnapshot, readCachedResponse, verifyPaidRequest } from '@/lib/paywallPayment'
import { getService } from '@/lib/serviceRegistry'

function normalizeUpstreamPayload(data: unknown) {
  if (typeof data === 'string') {
    return { message: data, model: 'upstream-text', timestamp: new Date().toISOString() }
  }

  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>
    const message =
      typeof record.message === 'string'
        ? record.message
        : typeof record.response === 'string'
          ? record.response
          : JSON.stringify(data)

    return {
      message,
      model: typeof record.model === 'string' ? record.model : 'upstream-json',
      timestamp: typeof record.timestamp === 'string' ? record.timestamp : new Date().toISOString(),
      raw: data,
    }
  }

  return { message: 'Upstream service returned an empty response.', model: 'upstream-empty', timestamp: new Date().toISOString() }
}

export async function POST(req: NextRequest) {
  try {
    const serviceId = req.nextUrl.searchParams.get('service')
    if (!serviceId) {
      return NextResponse.json({ error: 'Missing service id.' }, { status: 400 })
    }

    const service = await getService(serviceId)
    if (!service) {
      return NextResponse.json({ error: 'Service not found.' }, { status: 404 })
    }

    const { reservationId, idempotencyKey, signature, prompt, clientAddress } = await req.json()

    if (!reservationId || !idempotencyKey || !signature || !clientAddress) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const cached = await readCachedResponse(idempotencyKey)
    if (cached) return NextResponse.json(cached)

    const { reservation, deadline } = await verifyPaidRequest({
      reservationId,
      signature,
      clientAddress,
    })

    await enqueueItem(clientAddress, reservation.nonce, deadline, signature)

    const upstreamResponse = await fetch(service.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-FlowPay-Service': service.serviceId },
      body: JSON.stringify({
        prompt,
        clientAddress,
        serviceId: service.serviceId,
      }),
      cache: 'no-store',
    })

    if (!upstreamResponse.ok) {
      return NextResponse.json(
        { error: `Upstream service failed with ${upstreamResponse.status}.` },
        { status: 502 }
      )
    }

    const contentType = upstreamResponse.headers.get('content-type') ?? ''
    const upstreamPayload = contentType.includes('application/json')
      ? await upstreamResponse.json()
      : await upstreamResponse.text()

    const normalized = normalizeUpstreamPayload(upstreamPayload)
    const { availableCredits, onChainRemaining, pendingQueued } = await getCreditsSnapshot(clientAddress, service.serviceId)

    const result = {
      success: true,
      response: normalized,
      creditsUsed: 1,
      creditsRemaining: availableCredits.toString(),
      pendingCredits: pendingQueued,
      onChainCredits: onChainRemaining.toString(),
      serviceId: service.serviceId,
    }

    await cacheResponse(idempotencyKey, result)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
