# Android capability matrix

ADC should expose Android capabilities according to the authority the installed App actually has.
The local App switch is one authorization gate; it does not replace runtime permissions, special
access, user confirmation, foreground requirements or Android's privileged-system boundaries.

## Capability modes

| Mode                 | Meaning                                                                    |
| -------------------- | -------------------------------------------------------------------------- |
| Standard             | A normal installed App can execute after ordinary runtime permission.      |
| Special access       | Android requires a dedicated Settings approval screen.                     |
| User-confirmed       | Every activation or sensitive session requires a system-owned prompt.      |
| Foreground/event     | The App must be visible or wait for a physical event such as an NFC tap.   |
| Managed-device       | Requires Device Owner/Profile Owner or a system/privileged App.            |
| Settings bridge only | ADC may open the relevant Settings page but must not claim direct control. |

Hardware and API support must be detected at runtime. A provider must not be advertised as available
merely because its code is present in the APK.

## Recommended capability surface

| Domain                           | Candidate tools                                                                                              | Mode                                                                                           | ADC fit                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Device health                    | `device.info.get`, `device.storage.get`, `device.memory.get`, `device.thermal.get`                           | Standard                                                                                       | High; bounded read-only facts.                                                    |
| Display                          | `display.status`, `display.brightness.set`, `display.rotation.set`, `display.timeout.set`                    | Standard read; Special access for global writes                                                | High when values are bounded and current values are returned.                     |
| Audio and haptics                | `audio.status`, `audio.volume.set`, `audio.ringer.set`, `device.vibrate`                                     | Standard; Do Not Disturb needs Special access                                                  | High; writes are side effects and should be locally switchable.                   |
| Sensors                          | `sensor.list`, `sensor.sample`                                                                               | Standard with sensor-specific restrictions                                                     | High for bounded samples; continuous streams need sessions and quotas.            |
| Camera and microphone            | `camera.capture`, `audio.record`                                                                             | Runtime permission, foreground, visible indicators                                             | High but sensitive; disabled by default and Artifact-backed.                      |
| Media                            | `media.session.get`, `media.playback.control`, photo/document picker operations                              | Standard or user-selected content                                                              | High; avoid broad storage access when a system picker is sufficient.              |
| Bluetooth                        | `bluetooth.status`, `bluetooth.paired.list`, `bluetooth.scan`, `bluetooth.gatt.read`, `bluetooth.gatt.write` | Nearby Devices permission; pairing and enable flows are User-confirmed                         | High. Use bounded scans and explicit device/service selectors.                    |
| Wi-Fi                            | `wifi.status`, `wifi.scan`, `wifi.network.request`                                                           | Runtime permission and throttling; connection is User-confirmed                                | Medium to high. Do not expose unrestricted saved-network mutation.                |
| Hotspot                          | `hotspot.local.start`, `hotspot.local.stop`, `hotspot.status`                                                | Standard LocalOnlyHotspot; internet tethering is Managed-device                                | Medium. Name local-only behavior explicitly.                                      |
| NFC                              | `nfc.status`, `nfc.tag.read`, `nfc.tag.write`, `nfc.transceive`                                              | Foreground/event; physical tag tap                                                             | High for workflows involving tags. NFC radio toggling is Settings bridge only.    |
| USB                              | `usb.devices.list`, `usb.device.open`, device-class-specific transfer tools                                  | Per-device system confirmation                                                                 | High for lab hardware and peripherals; generic raw access needs strict bounds.    |
| UWB / Wi-Fi Aware / Wi-Fi Direct | discovery, ranging and session tools                                                                         | Hardware-specific runtime permission and sessions                                              | Medium; advertise only on supported hardware.                                     |
| Apps and intents                 | `app.open`, `app.info`, typed deep links, share/picker flows                                                 | Standard with package-visibility limits                                                        | Medium. Never expose arbitrary unrestricted Intent construction.                  |
| Notifications                    | show, list, dismiss and action tools                                                                         | Posting is runtime permission; reading needs Notification Listener special access              | High when notification contents are separately gated and redacted.                |
| Personal data                    | contacts, calendar, call-log and SMS providers                                                               | Sensitive runtime permission; some functions require default-app roles or Play policy approval | Optional providers, not baseline Node capabilities.                               |
| Telephony                        | network/subscription status, dialer and SMS compose flows                                                    | Permission and user confirmation; radio/mobile-data control is privileged                      | Read and user-mediated actions only in the baseline App.                          |
| Clipboard                        | `clipboard.get`, `clipboard.set`                                                                             | Foreground and Android privacy restrictions                                                    | Low to medium; disabled by default and never polled continuously.                 |
| Accessibility/UI                 | existing inspect, action, gesture and navigation tools                                                       | Special access                                                                                 | High, but keep password redaction, bounded snapshots and a separate local switch. |
| Screen capture                   | existing `screen.capture`                                                                                    | User-confirmed MediaProjection session                                                         | High; consent is session-scoped and images remain Artifacts.                      |
| VPN                              | prepare and start an App-owned VPN profile                                                                   | User-confirmed and foreground service                                                          | Optional provider. Never mutate another VPN App's configuration.                  |
| Device administration            | lock, reboot, wipe, kiosk, silent install, certificate and permission policy                                 | Managed-device                                                                                 | Separate enterprise Node mode only; never imply support in the normal App.        |

## Specific system controls

| Requested control            | Normal App behavior                                                                                                                           | ADC decision                                                                                                     |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Bluetooth on/off             | Android 13+ rejects direct enable/disable for ordinary Apps. Enabling can use a system confirmation dialog.                                   | Expose status, scan and communication. Use `bluetooth.request_enable`; do not expose a misleading silent toggle. |
| NFC on/off                   | No public ordinary-App toggle. Tag read/write works while the App is in the required foreground flow.                                         | Expose tag sessions and status; use a Settings bridge when NFC is off.                                           |
| Internet hotspot             | Public LocalOnlyHotspot does not share mobile internet. Tethering control is privileged.                                                      | Expose local-only hotspot with explicit naming; reserve tethering for managed-device mode.                       |
| Airplane mode                | State can be observed, but changing the global setting requires privileged secure-settings authority.                                         | Expose read status and `settings.open`; no normal-App toggle.                                                    |
| Global brightness            | Reading is available. Writing requires `WRITE_SETTINGS` plus explicit user special access. Per-window brightness affects only ADC's Activity. | Expose read immediately and global set only while special access is active.                                      |
| Wi-Fi on/off                 | Modern target SDKs cannot silently toggle Wi-Fi. Scans are permission-gated and throttled.                                                    | Expose status, bounded scans and user-mediated network requests.                                                 |
| Mobile data                  | Ordinary Apps cannot directly toggle the cellular radio/data setting.                                                                         | Read coarse network state; Settings bridge or managed-device provider only.                                      |
| Silent App install/uninstall | Requires package-installer user confirmation or privileged/device-owner authority.                                                            | User-confirmed package flow in baseline; silent lifecycle only in managed-device mode.                           |

## Discovery and authorization contract

The Mobile Node should add a `device.features.get` inventory and derive its manifest from:

1. hardware features reported by `PackageManager`,
2. Android API level and vendor behavior,
3. ordinary runtime permissions,
4. special-access state,
5. current foreground/session state,
6. the App's local capability switch, and
7. optional management mode such as Device Owner.

Unavailable tools need structured reason codes rather than one generic message:

- `unsupported_hardware`
- `unsupported_os`
- `permission_required`
- `special_access_required`
- `user_confirmation_required`
- `foreground_required`
- `physical_interaction_required`
- `device_owner_required`
- `temporarily_unavailable`

Agent grants never auto-expand when a new provider becomes available. Sensitive writes require
idempotency keys, and continuous operations such as Bluetooth scans, NFC waiting, sensor sampling,
audio recording and VPN sessions need bounded session lifetimes, cancellation and quotas.

## Delivery order

1. Add feature inventory plus device/storage/memory/thermal/display/audio read tools.
2. Add bounded display/audio/vibration/torch writes with local switches and special-access flows.
3. Add Bluetooth status, paired devices, bounded BLE scan and GATT operations.
4. Add NFC tag sessions and USB peripheral sessions.
5. Add Wi-Fi scan/network request and explicitly local-only hotspot.
6. Add camera, microphone, media and notification-listener providers as separately disabled groups.
7. Add an explicitly provisioned managed-device edition for privileged administration.

References: Android's official documentation for
[Bluetooth permissions](https://developer.android.com/develop/connectivity/bluetooth/bt-permissions),
[Bluetooth adapter restrictions](https://developer.android.com/reference/android/bluetooth/BluetoothAdapter),
[NFC tag operations](https://developer.android.com/develop/connectivity/nfc/advanced-nfc),
[Wi-Fi scanning](https://developer.android.com/develop/connectivity/wifi/wifi-scan),
[local-only hotspot](https://developer.android.com/develop/connectivity/wifi/localonlyhotspot) and
[write-settings special access](<https://developer.android.com/reference/android/provider/Settings.System#canWrite(android.content.Context)>).
