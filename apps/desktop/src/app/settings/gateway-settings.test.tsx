import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getConnectionConfig = vi.fn()
const probeConnectionConfig = vi.fn()
const saveConnectionConfig = vi.fn()

// This test owns the machine-level GatewaySettings contract. The managed SSH
// update section mounted below the registry has its own focused coverage
// (store/managed-updates.test.ts); keep its store subscriptions out of this
// single-purpose test.
vi.mock('./managed-updates-section', () => ({ ManagedUpdatesSection: () => null }))

const localConnection = {
  cloudOrg: '',
  envOverride: false,
  mode: 'local',
  remoteAuthMode: 'token',
  remoteOauthConnected: false,
  remoteTokenPreview: null,
  remoteTokenSet: false,
  remoteUrl: ''
}

beforeEach(() => {
  getConnectionConfig.mockReset()
  getConnectionConfig.mockResolvedValue(localConnection)
  probeConnectionConfig.mockReset()
  saveConnectionConfig.mockReset()
  saveConnectionConfig.mockResolvedValue(localConnection)
  Object.defineProperty(window, 'hermesDesktop', {
    configurable: true,
    value: { getConnectionConfig, probeConnectionConfig, saveConnectionConfig }
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('GatewaySettings', () => {
  it('loads the machine-level connection config (no profile scoping)', async () => {
    const { GatewaySettings } = await import('./gateway-settings')

    render(<GatewaySettings />)
    expect(await screen.findByText('Local gateway')).toBeTruthy()
    expect(
      screen.getByText('Start a private Hermes backend on localhost. This is the default and works offline.')
    ).toBeTruthy()

    // The page manages the machine's gateway connections; it must load the
    // global config, never a per-profile override.
    await waitFor(() => expect(getConnectionConfig).toHaveBeenCalledWith(null))
    expect(getConnectionConfig).not.toHaveBeenCalledWith(expect.any(String))

    // The legacy per-profile scope switcher must not render.
    expect(screen.queryByText('Applies to')).toBeNull()
    expect(screen.queryByText('All profiles')).toBeNull()
    expect(screen.queryByText('Use default gateway')).toBeNull()
  })

  it('shows the concrete remote probe failure instead of generic unreachable copy', async () => {
    getConnectionConfig.mockResolvedValue({
      ...localConnection,
      mode: 'remote',
      remoteUrl: 'http://10.0.0.94:9119'
    })
    probeConnectionConfig.mockResolvedValue({
      authMode: 'unknown',
      baseUrl: 'http://10.0.0.94:9119',
      error: 'connect ENETUNREACH 10.0.0.94:9119',
      providers: [],
      reachable: false,
      version: null
    })

    const { GatewaySettings } = await import('./gateway-settings')

    render(<GatewaySettings />)

    expect(await screen.findByText('connect ENETUNREACH 10.0.0.94:9119')).toBeTruthy()
    expect(screen.queryByText(/Could not reach this gateway yet/)).toBeNull()
  })

  it('ignores an in-flight probe result after the remote URL is cleared', async () => {
    getConnectionConfig.mockResolvedValue({
      ...localConnection,
      mode: 'remote',
      remoteUrl: 'http://10.0.0.94:9119'
    })

    let resolveProbe: (result: unknown) => void = () => {}
    probeConnectionConfig.mockReturnValue(
      new Promise(resolve => {
        resolveProbe = resolve
      })
    )

    const { GatewaySettings } = await import('./gateway-settings')

    render(<GatewaySettings />)
    await waitFor(() => expect(probeConnectionConfig).toHaveBeenCalledWith('http://10.0.0.94:9119'))

    fireEvent.change(screen.getByDisplayValue('http://10.0.0.94:9119'), { target: { value: '' } })

    await act(async () => {
      resolveProbe({
        authMode: 'unknown',
        baseUrl: 'http://10.0.0.94:9119',
        error: 'connect ENETUNREACH 10.0.0.94:9119',
        providers: [],
        reachable: false,
        version: null
      })
    })

    expect(screen.queryByText('connect ENETUNREACH 10.0.0.94:9119')).toBeNull()
    expect(screen.queryByText(/Could not reach this gateway yet/)).toBeNull()
  })
})
