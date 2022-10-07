import { GetNetworkConfigRequest } from 'src/app/edge/settings/network/getNetworkConfigRequest';
import { GetNetworkConfigResponse } from 'src/app/edge/settings/network/getNetworkConfigResponse';
import { SetNetworkConfigRequest } from 'src/app/edge/settings/network/setNetworkConfigRequest';
import { Interface } from 'src/app/shared/interface/interface';
import { ComponentJsonApiRequest } from 'src/app/shared/jsonrpc/request/componentJsonApiRequest';
import { Edge, EdgeConfig, Websocket, Service } from 'src/app/shared/shared';
import { ComponentConfigurator, ConfigurationMode } from '../../views/configuration-execute/component-configurator';
import { EmsAppId } from '../../views/heckert-app-installer/heckert-app-installer.component';
import { AbstractHomeIbn } from './abstract-home';
import { View } from '../abstract-ibn';
import { AppCenterUtil } from '../../shared/appcenterutil';

export class HomeHeckertIbn extends AbstractHomeIbn {

    public readonly type = 'Symphon-E';

    public readonly id = 'heckert';

    constructor() {
        super([
            View.PreInstallation,
            View.PreInstallationUpdate,
            View.ConfigurationSystem,
            View.ProtocolInstaller,
            View.ProtocolCustomer,
            View.ProtocolSystem,
            View.ConfigurationEmergencyReserve,
            View.ConfigurationLineSideMeterFuse,
            View.ProtocolPv,
            View.ProtocolAdditionalAcProducers,
            View.ProtocolFeedInLimitation,
            View.HeckertAppInstaller,
            View.ConfigurationSummary,
            View.ConfigurationExecute,
            View.ProtocolSerialNumbers,
            View.Completion
        ]);
    }

    public getComponentConfigurator(edge: Edge, config: EdgeConfig, websocket: Websocket, service: Service) {

        const componentConfigurator: ComponentConfigurator =
            super.getComponentConfigurator(edge, config, websocket, service);

        // TODO remove
        // system not updated => appManager not fully available
        const isAppManagerAvailable: boolean = AppCenterUtil.isAppManagerAvailable(edge);
        const confModeRemoveAndConfigure: ConfigurationMode = isAppManagerAvailable ?
            ConfigurationMode.CreatedByAppManager : ConfigurationMode.RemoveAndConfigure;

        const confModeRemoveOnly: ConfigurationMode = isAppManagerAvailable ?
            ConfigurationMode.CreatedByAppManager : ConfigurationMode.RemoveOnly;

        let appId: string
        let alias: string
        let properties: {}
        switch (this.selectedFreeApp.id) {
            case EmsAppId.Keba:
                appId = "App.Evcs.Keba"
                alias = "Ladestation"
                properties = {
                    IP: "192.168.25.11"
                }
                break
            case EmsAppId.HardyBarthSingle:
                appId = "App.Evcs.HardyBarth"
                alias = "Ladestation"
                properties = {
                    IP: "192.168.25.30"
                }
                break
            case EmsAppId.HardyBarthDouble:
                // TODO single app
                break
            case EmsAppId.HeatPump:
                appId = "App.Heat.HeatPump"
                alias = "Wärmepumpe"
                properties = {
                    OUTPUT_CHANNEL_1: "io0/Relay1",
                    OUTPUT_CHANNEL_2: "io0/Relay2"
                }
                break
            case EmsAppId.HeatingElement:
                appId = "App.Heat.HeatingElement"
                alias = "Heizstab"
                properties = {
                    OUTPUT_CHANNEL_PHASE_L1: "io0/Relay1",
                    OUTPUT_CHANNEL_PHASE_L2: "io0/Relay2",
                    OUTPUT_CHANNEL_PHASE_L3: "io0/Relay3"
                }
                break
        }
        if (isAppManagerAvailable) {
            // remove old apps
            componentConfigurator.addInstallAppCallback(() => {
                return new Promise((resolve, reject) => {
                    // first remove old apps to make sure the new app can be installed
                    // e. g. an HeatPump is installed and uses relays and a other app which also
                    // uses relay ports cant be installed when not enought relays are available

                    // for now its only possible to create one app in the IBN
                    // to avoid installing multiple apps when executing the IBN
                    // multiple times
                    let deletePromise: Promise<any>[] = [];
                    ["App.Evcs.Keba", "App.Evcs.HardyBarth", "App.Heat.HeatPump",
                        "App.Heat.HeatingElement"].forEach(removeId => {
                            if (removeId == appId) {
                                return;
                            }
                            deletePromise.push(AppCenterUtil.removeInstancesOfApp(edge, websocket, removeId));
                        });
                    if (!appId) {
                        Promise.all(deletePromise)
                            .then(result => resolve(result))
                            .catch(error => reject(error))
                    } else {
                        Promise.all(deletePromise)
                            .finally(() => {
                                AppCenterUtil.createOrUpdateApp(edge, websocket, appId, alias, properties)
                                    .then(value => resolve(value))
                                    .catch(error => reject(error))
                            });
                    }
                });
            });
        }

        //components specific to Heckert
        const freeAppId: EmsAppId = this.selectedFreeApp.id;
        const isAppEvcs: boolean = [
            EmsAppId.HardyBarthSingle,
            EmsAppId.HardyBarthDouble,
            EmsAppId.Keba
        ].includes(freeAppId);

        // Add ip address to network configuration if HardyBarthDouble gets configured
        // else the ip gets set by the appManager
        if ((!isAppManagerAvailable && isAppEvcs) || freeAppId === EmsAppId.HardyBarthDouble) {
            if (!this.addIpAddress('eth0', '192.168.25.10/24', edge, websocket)) {
                service.toast('Eine für die Ladestation notwendige IP-Adresse konnte nicht zur Netzwerkkonfiguration hinzugefügt werden.'
                    , 'danger');
            }
        }

        // Add components depending on the selected app
        componentConfigurator.add({
            factoryId: 'Evcs.HardyBarth',
            componentId: 'evcs0',
            alias: 'Ladestation',
            properties: [
                { name: 'enabled', value: true },
                { name: 'debugMode', value: false },
                { name: 'ip', value: '192.168.25.30' },
                { name: 'minHwCurrent', value: 6000 },
                { name: 'maxHwCurrent', value: 32000 }
            ],
            mode: freeAppId === EmsAppId.HardyBarthSingle ? confModeRemoveAndConfigure : confModeRemoveOnly
        });

        componentConfigurator.add({
            factoryId: 'Evcs.HardyBarth',
            componentId: 'evcs0',
            alias: 'Ladestation 1',
            properties: [
                { name: 'enabled', value: true },
                { name: 'debugMode', value: false },
                { name: 'ip', value: '192.168.25.30' },
                { name: 'minHwCurrent', value: 6000 },
                { name: 'maxHwCurrent', value: 16000 }
            ],
            mode: freeAppId === EmsAppId.HardyBarthDouble ? ConfigurationMode.RemoveAndConfigure : ConfigurationMode.RemoveOnly
        });

        componentConfigurator.add({
            factoryId: 'Evcs.HardyBarth',
            componentId: 'evcs1',
            alias: 'Ladestation 2',
            properties: [
                { name: 'enabled', value: true },
                { name: 'debugMode', value: false },
                { name: 'ip', value: '192.168.25.31' },
                { name: 'minHwCurrent', value: 6000 },
                { name: 'maxHwCurrent', value: 16000 }
            ],
            mode: freeAppId === EmsAppId.HardyBarthDouble ? ConfigurationMode.RemoveAndConfigure : ConfigurationMode.RemoveOnly
        });

        componentConfigurator.add({
            factoryId: 'Evcs.Keba.KeContact',
            componentId: 'evcs0',
            alias: 'Ladestation',
            properties: [
                { name: 'enabled', value: true },
                { name: 'debugMode', value: false },
                { name: 'ip', value: '192.168.25.11' },
                { name: 'minHwCurrent', value: 6000 }
            ],
            mode: freeAppId === EmsAppId.Keba ? confModeRemoveAndConfigure : confModeRemoveOnly
        });

        componentConfigurator.add({
            factoryId: 'Controller.IO.HeatingElement',
            componentId: 'ctrlIoHeatingElement0',
            alias: 'Heizstab',
            properties: [
                { name: 'enabled', value: true },
                { name: 'mode', value: 'AUTOMATIC' },
                { name: 'outputChannelPhaseL1', value: 'io0/Relay1' },
                { name: 'outputChannelPhaseL2', value: 'io0/Relay2' },
                { name: 'outputChannelPhaseL3', value: 'io0/Relay3' },
                { name: 'defaultLevel', value: 'LEVEL_1' },
                { name: 'endTime', value: '17:00' },
                { name: 'workMode', value: 'TIME' },
                { name: 'minTime', value: 1 },
                { name: 'powerPerPhase', value: 2000 },
                { name: 'minimumSwitchingTime', value: 60 }
            ],
            mode: freeAppId === EmsAppId.HeatingElement ? confModeRemoveAndConfigure : confModeRemoveOnly
        });

        componentConfigurator.add({
            factoryId: 'Controller.Io.HeatPump.SgReady',
            componentId: 'ctrlIoHeatPump0',
            alias: 'Wärmepumpe',
            properties: [
                { name: 'enabled', value: true },
                { name: 'debugMode', value: false },
                { name: 'outputChannel1', value: 'io0/Relay1' },
                { name: 'outputChannel2', value: 'io0/Relay2' },
                { name: 'mode', value: 'AUTOMATIC' },
                { name: 'manualState', value: 'REGULAR' },
                { name: 'automaticRecommendationCtrlEnabled', value: true },
                { name: 'automaticRecommendationSurplusPower', value: 3000 },
                { name: 'automaticForceOnCtrlEnabled', value: true },
                { name: 'automaticForceOnSurplusPower', value: 5000 },
                { name: 'automaticForceOnSoc', value: 10 },
                { name: 'automaticLockCtrlEnabled', value: false },
                { name: 'automaticLockGridBuyPower', value: 5000 },
                { name: 'automaticLockSoc', value: 20 },
                { name: 'minimumSwitchingTime', value: 60 }
            ],
            mode: freeAppId === EmsAppId.HeatPump ? confModeRemoveAndConfigure : confModeRemoveOnly
        });

        // Add EVCS-Controller if selected app is an EVCS
        componentConfigurator.add({
            factoryId: 'Controller.Evcs',
            componentId: 'ctrlEvcs0',
            alias: 'Ansteuerung der Ladestation' + (freeAppId === EmsAppId.HardyBarthDouble ? ' 1' : ''),
            properties: [
                { name: 'enabled', value: true },
                { name: 'debugMode', value: false },
                { name: 'evcs.id', value: 'evcs0' },
                { name: 'enabledCharging', value: true },
                { name: 'chargeMode', value: 'FORCE_CHARGE' },
                { name: 'forceChargeMinPower', value: 7360 },
                { name: 'defaultChargeMinPower', value: 0 },
                { name: 'priority', value: 'CAR' },
                { name: 'ess.id', value: 'ess0' },
                { name: 'energySessionLimit', value: 0 }
            ],
            mode: isAppEvcs ? (freeAppId === EmsAppId.HardyBarthDouble ?
                ConfigurationMode.RemoveAndConfigure : confModeRemoveAndConfigure) : ConfigurationMode.RemoveOnly
        });

        // Add second EVCS-Controller for HardyBarthDouble if selected
        componentConfigurator.add({
            factoryId: 'Controller.Evcs',
            componentId: 'ctrlEvcs1',
            alias: 'Ansteuerung der Ladestation 2',
            properties: [
                { name: 'enabled', value: true },
                { name: 'debugMode', value: false },
                { name: 'evcs.id', value: 'evcs1' },
                { name: 'enabledCharging', value: true },
                { name: 'chargeMode', value: 'FORCE_CHARGE' },
                { name: 'forceChargeMinPower', value: 7360 },
                { name: 'defaultChargeMinPower', value: 0 },
                { name: 'priority', value: 'CAR' },
                { name: 'ess.id', value: 'ess0' },
                { name: 'energySessionLimit', value: 0 }
            ],
            mode: freeAppId === EmsAppId.HardyBarthDouble ? ConfigurationMode.RemoveAndConfigure : ConfigurationMode.RemoveOnly
        });
        return componentConfigurator;
    }

    /**
     * Adds an ip address to the given interface.
     * Returns false if an error occurs.
     *
     * @param interfaceName Interface default 'eth0'
     * @param ip Ip that should be added
     * @param edge the current edge.
     * @param websocket the websocket connection.
     * @returns the status of adding ip address as boolean.
     */
    public addIpAddress(interfaceName: string, ip: string, edge: Edge, websocket: Websocket) {
        let iface: Interface;

        edge.sendRequest(
            websocket,
            new ComponentJsonApiRequest({ componentId: '_host', payload: new GetNetworkConfigRequest() })
        ).then((response) => {
            const result = (response as GetNetworkConfigResponse).result;

            // Get interface
            for (const name of Object.keys(result.interfaces)) {
                if (name === interfaceName) {
                    iface = { name, model: result.interfaces[name] };
                }
            }

            // No interface with given name found
            if (!iface) {
                console.log('Network interface with name \'\'' + interfaceName + '\'\' was not found.');
                return false;
            }

            // Unset Gateway and DNS if DHCP is activated
            if (iface.model.dhcp) {
                iface.model.gateway = null;
                iface.model.dns = null;
            }

            // Set the ip in the model of the interface
            // or return if it already exists
            if (iface.model.addresses === null) {
                iface.model.addresses = new Array(ip);
            } else {
                if (iface.model.addresses.includes(ip)) {
                    return true;
                }
                iface.model.addresses.push(ip);
            }

            // Unset Gateway and DNS if DHCP is activated
            if (iface.model.dhcp) {
                iface.model.gateway = null;
                iface.model.dns = null;
            }

            const params = {
                interfaces: {}
            };
            params.interfaces[iface.name] = iface.model;

            edge.sendRequest(
                websocket,
                new ComponentJsonApiRequest({ componentId: '_host', payload: new SetNetworkConfigRequest(params) })
            ).then(() => true).catch((reason) => {
                console.log(reason);
            });
        }).catch(reason => {
            console.log(reason);
        });
        return false;
    }
}