import { NextRequest, NextResponse } from 'next/server'
import { recoverMessageAddress } from 'viem'
import { IS_PAYWALL_V2, PAYWALL_ADDRESS, PAYWALL_V2_ABI, publicClient } from '@/lib/arcChain'
import { listServices, registerService } from '@/lib/serviceRegistry'

function isSafeServiceEndpoint(raw: string): boolean {
  try {
    const url = new URL(raw)
    const hostname = url.hostname.toLowerCase()
    const privateIpv4 = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/

    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') return false
    if (!['http:', 'https:'].includes(url.protocol)) return false
    if (
      hostname === 'localhost' ||
      hostname === '::1' ||
      hostname.endsWith('.local') ||
      privateIpv4.test(hostname)
    ) return false

    return true
  } catch {
    return false
  }
}

export async function GET() {
  const services = await listServices()
  const enriched = await Promise.all(
    services.map(async (service) => {
      if (IS_PAYWALL_V2 && /^0x[0-9a-fA-F]{64}$/.test(service.serviceId)) {
        try {
          const onChain = await publicClient.readContract({
            address: PAYWALL_ADDRESS,
            abi: PAYWALL_V2_ABI,
            functionName: 'getService',
            args: [service.serviceId as `0x${string}`],
          })

          return {
            serviceId: service.serviceId,
            ownerAddress: onChain.owner,
            name: service.name,
            desc: service.desc,
            price: onChain.pricePerRequest.toString(),
            active: onChain.active,
            proxyUrl: service.proxyUrl,
            createdAt: service.createdAt,
          }
        } catch {
          return null
        }
      }

      return {
        serviceId: service.serviceId,
        ownerAddress: service.ownerAddress,
        name: service.name,
        desc: service.desc,
        proxyUrl: service.proxyUrl,
        createdAt: service.createdAt,
      }
    })
  )

  return NextResponse.json({
    services: enriched.filter(Boolean),
  })
}

export async function POST(req: NextRequest) {
  try {
    const { ownerAddress, name, desc, endpoint, signature, message, serviceId } = await req.json()

    if (!ownerAddress || !name || !endpoint || !signature || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!isSafeServiceEndpoint(endpoint)) {
      return NextResponse.json({ error: 'Service endpoint must be a public HTTPS URL.' }, { status: 400 })
    }

    const recovered = await recoverMessageAddress({
      message,
      signature,
    })

    if (recovered.toLowerCase() !== ownerAddress.toLowerCase()) {
      return NextResponse.json({ error: 'Invalid wallet signature.' }, { status: 401 })
    }

    if (IS_PAYWALL_V2) {
      if (!serviceId || !/^0x[0-9a-fA-F]{64}$/.test(serviceId)) {
        return NextResponse.json({ error: 'Missing onchain service id.' }, { status: 400 })
      }

      const onChain = await publicClient.readContract({
        address: PAYWALL_ADDRESS,
        abi: PAYWALL_V2_ABI,
        functionName: 'getService',
        args: [serviceId as `0x${string}`],
      })

      if (onChain.owner.toLowerCase() !== ownerAddress.toLowerCase()) {
        return NextResponse.json({ error: 'Wallet is not the onchain service owner.' }, { status: 403 })
      }
    }

    const service = await registerService({
      serviceId,
      ownerAddress,
      name,
      desc,
      endpoint,
    })

    if (IS_PAYWALL_V2 && serviceId) {
      const onChain = await publicClient.readContract({
        address: PAYWALL_ADDRESS,
        abi: PAYWALL_V2_ABI,
        functionName: 'getService',
        args: [serviceId as `0x${string}`],
      })

      return NextResponse.json({
        service: {
          serviceId: service.serviceId,
          ownerAddress: onChain.owner,
          name: service.name,
          desc: service.desc,
          price: onChain.pricePerRequest.toString(),
          active: onChain.active,
          proxyUrl: service.proxyUrl,
          createdAt: service.createdAt,
        },
      })
    }

    return NextResponse.json({
      service: {
        serviceId: service.serviceId,
        ownerAddress: service.ownerAddress,
        name: service.name,
        desc: service.desc,
        proxyUrl: service.proxyUrl,
        createdAt: service.createdAt,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
