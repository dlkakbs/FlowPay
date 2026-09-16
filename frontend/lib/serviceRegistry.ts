import { randomUUID } from 'crypto'
import { getRedis } from './nonceReserver'
import { paymentRedisKey } from './storageKeys'

export interface PublicServiceRecord {
  serviceId: string
  ownerAddress: string
  name: string
  desc: string
  proxyUrl: string
  createdAt: string
}

export interface ServiceRecord extends PublicServiceRecord {
  endpoint: string
}

const REGISTRY_KEY = paymentRedisKey('services')

function endpointKey(serviceId: string) {
  return paymentRedisKey(`service-endpoint:${serviceId}`)
}

async function readPublicRegistry(): Promise<PublicServiceRecord[]> {
  const redis = getRedis()
  const raw = await redis.get<string>(REGISTRY_KEY)
  if (!raw) return []
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
  return Array.isArray(parsed) ? parsed : []
}

async function writePublicRegistry(services: PublicServiceRecord[]) {
  const redis = getRedis()
  await redis.set(REGISTRY_KEY, JSON.stringify(services))
}

async function readEndpoint(serviceId: string): Promise<string | null> {
  const redis = getRedis()
  const raw = await redis.get<string>(endpointKey(serviceId))
  if (!raw) return null
  return typeof raw === 'string' ? raw : String(raw)
}

async function writeEndpoint(serviceId: string, endpoint: string) {
  const redis = getRedis()
  await redis.set(endpointKey(serviceId), endpoint)
}

export async function listServices(): Promise<PublicServiceRecord[]> {
  return readPublicRegistry()
}

export async function getService(serviceId: string): Promise<ServiceRecord | null> {
  const services = await readPublicRegistry()
  const service = services.find((item) => item.serviceId === serviceId)
  if (!service) return null

  const endpoint = await readEndpoint(serviceId)
  if (!endpoint) return null

  return { ...service, endpoint }
}

export async function registerService(input: {
  serviceId?: string
  ownerAddress: string
  name: string
  desc?: string
  endpoint: string
}): Promise<ServiceRecord> {
  const services = await readPublicRegistry()
  const serviceId = input.serviceId ?? `svc_${randomUUID().replace(/-/g, '').slice(0, 12)}`
  const existing = services.find((service) => service.serviceId === serviceId)

  const publicRecord: PublicServiceRecord = existing
    ? {
        ...existing,
        ownerAddress: input.ownerAddress,
        name: input.name,
        desc: input.desc ?? '',
      }
    : {
        serviceId,
        ownerAddress: input.ownerAddress,
        name: input.name,
        desc: input.desc ?? '',
        proxyUrl: `/api/proxy?service=${serviceId}`,
        createdAt: new Date().toISOString(),
      }

  await writePublicRegistry(
    existing
      ? services.map((service) => (service.serviceId === serviceId ? publicRecord : service))
      : [...services, publicRecord]
  )
  await writeEndpoint(serviceId, input.endpoint)

  return {
    ...publicRecord,
    endpoint: input.endpoint,
  }
}
