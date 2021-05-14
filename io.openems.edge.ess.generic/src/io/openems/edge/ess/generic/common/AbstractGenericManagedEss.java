package io.openems.edge.ess.generic.common;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import org.osgi.service.cm.ConfigurationAdmin;
import org.osgi.service.component.ComponentContext;
import org.osgi.service.event.Event;
import org.osgi.service.event.EventHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import io.openems.common.channel.AccessMode;
import io.openems.common.exceptions.OpenemsError.OpenemsNamedException;
import io.openems.edge.battery.api.Battery;
import io.openems.edge.batteryinverter.api.BatteryInverterConstraint;
import io.openems.edge.batteryinverter.api.ManagedSymmetricBatteryInverter;
import io.openems.edge.batteryinverter.api.SymmetricBatteryInverter;
import io.openems.edge.common.component.AbstractOpenemsComponent;
import io.openems.edge.common.component.ComponentManager;
import io.openems.edge.common.component.OpenemsComponent;
import io.openems.edge.common.event.EdgeEventConstants;
import io.openems.edge.common.modbusslave.ModbusSlave;
import io.openems.edge.common.modbusslave.ModbusSlaveNatureTable;
import io.openems.edge.common.modbusslave.ModbusSlaveTable;
import io.openems.edge.common.modbusslave.ModbusType;
import io.openems.edge.common.startstop.StartStop;
import io.openems.edge.common.startstop.StartStopConfig;
import io.openems.edge.common.startstop.StartStoppable;
import io.openems.edge.common.type.TypeUtils;
import io.openems.edge.ess.api.HybridEss;
import io.openems.edge.ess.api.ManagedSymmetricEss;
import io.openems.edge.ess.api.SymmetricEss;
import io.openems.edge.ess.generic.common.statemachine.Context;
import io.openems.edge.ess.generic.common.statemachine.StateMachine;
import io.openems.edge.ess.generic.common.statemachine.StateMachine.State;
import io.openems.edge.ess.power.api.Constraint;
import io.openems.edge.ess.power.api.Phase;
import io.openems.edge.ess.power.api.Pwr;
import io.openems.edge.ess.power.api.Relationship;

/**
 * Parent class for different implementations of Managed Energy Storage Systems,
 * consisting of a Battery-Inverter component and a Battery component.
 */
public abstract class AbstractGenericManagedEss<ESS extends SymmetricEss, BATTERY extends Battery, BATTERY_INVERTER extends ManagedSymmetricBatteryInverter>
		extends AbstractOpenemsComponent implements GenericManagedEss, ManagedSymmetricEss, SymmetricEss,
		OpenemsComponent, EventHandler, StartStoppable, ModbusSlave {

	private final Logger log = LoggerFactory.getLogger(AbstractGenericManagedEss.class);

	/**
	 * Manages the {@link State}s of the StateMachine.
	 */
	private final StateMachine stateMachine = new StateMachine(State.UNDEFINED);

	/**
	 * Helper wrapping class to handle everything related to Channels.
	 * 
	 * @return the {@link AbstractChannelManager}
	 */
	protected abstract AbstractChannelManager<ESS, BATTERY, BATTERY_INVERTER> getChannelManager();

	protected abstract ComponentManager getComponentManager();

	protected abstract BATTERY getBattery();

	protected abstract BATTERY_INVERTER getBatteryInverter();

	private StartStopConfig startStopConfig = StartStopConfig.AUTO;

	protected AbstractGenericManagedEss(io.openems.edge.common.channel.ChannelId[] firstInitialChannelIds,
			io.openems.edge.common.channel.ChannelId[]... furtherInitialChannelIds) {
		super(firstInitialChannelIds, furtherInitialChannelIds);
	}

	@Override
	protected void activate(ComponentContext context, String id, String alias, boolean enabled) {
		throw new IllegalArgumentException("Use the other activate() method!");
	}

	protected void activate(ComponentContext context, String id, String alias, boolean enabled,
			StartStopConfig startStopConfig, ConfigurationAdmin cm, String batteryInverterId, String batteryId) {
		super.activate(context, id, alias, enabled);
		this.startStopConfig = startStopConfig;

		// update filter for 'BatteryInverter'
		if (OpenemsComponent.updateReferenceFilter(cm, this.servicePid(), "batteryInverter", batteryInverterId)) {
			return;
		}

		// update filter for 'Battery'
		if (OpenemsComponent.updateReferenceFilter(cm, this.servicePid(), "battery", batteryId)) {
			return;
		}

		this.getChannelManager().activate(this.getComponentManager(), this.getBattery(), this.getBatteryInverter());
	}

	protected void deactivate() {
		this.getChannelManager().deactivate();
		super.deactivate();
	}

	@Override
	public void handleEvent(Event event) {
		if (!this.isEnabled()) {
			return;
		}
		switch (event.getTopic()) {

		case EdgeEventConstants.TOPIC_CYCLE_AFTER_PROCESS_IMAGE:
			this.handleStateMachine();
			break;
		}
	}

	/**
	 * Handles the State-Machine.
	 */
	private void handleStateMachine() {
		// Store the current State
		this.channel(GenericManagedEss.ChannelId.STATE_MACHINE).setNextValue(this.stateMachine.getCurrentState());

		// Initialize 'Start-Stop' Channel
		this._setStartStop(StartStop.UNDEFINED);

		// Prepare Context
		Context context = new Context(this, this.getBattery(), this.getBatteryInverter());

		// Call the StateMachine
		try {
			this.stateMachine.run(context);

			this.channel(GenericManagedEss.ChannelId.RUN_FAILED).setNextValue(false);

		} catch (OpenemsNamedException e) {
			this.channel(GenericManagedEss.ChannelId.RUN_FAILED).setNextValue(true);
			this.logError(this.log, "StateMachine failed: " + e.getMessage());
		}
	}

	@Override
	public String debugLog() {
		StringBuilder result = new StringBuilder() //
				.append("SoC:").append(this.getSoc().asString()) //
				.append("|L:").append(this.getActivePower().asString());

		// For HybridEss show actual Battery charge power and PV production power
		if (this instanceof HybridEss) {
			HybridEss me = (HybridEss) this;
			result //
					.append("|Battery:").append(me.getDcDischargePower().asString()) //
					.append("|PV:")
					.append(TypeUtils.subtract(this.getActivePower().get(), me.getDcDischargePower().get()));
		}

		// Show max AC export/import active power:
		// minimum of MaxAllowedCharge/DischargePower and MaxApparentPower
		result //
				.append("|Allowed:") //
				.append(TypeUtils.min(//
						this.getAllowedChargePower().get(), TypeUtils.multiply(this.getMaxApparentPower().get(), -1)))
				.append(";") //
				.append(TypeUtils.min(//
						this.getAllowedDischargePower().get(), this.getMaxApparentPower().get()));

		return result //
				.append("|").append(this.channel(GenericManagedEss.ChannelId.STATE_MACHINE).value().asOptionString()) //
				.toString();
	}

	/**
	 * Forwards the power request to the {@link SymmetricBatteryInverter}.
	 * 
	 * {@inheritDoc}
	 */
	@Override
	public void applyPower(int activePower, int reactivePower) throws OpenemsNamedException {
		this.getBatteryInverter().run(this.getBattery(), activePower, reactivePower);
	}

	/**
	 * Retrieves PowerPrecision from {@link SymmetricBatteryInverter}.
	 * 
	 * {@inheritDoc}
	 */
	@Override
	public int getPowerPrecision() {
		return this.getBatteryInverter().getPowerPrecision();
	}

	/**
	 * Retrieves StaticConstraints from {@link SymmetricBatteryInverter}.
	 * 
	 * {@inheritDoc}
	 */
	@Override
	public Constraint[] getStaticConstraints() throws OpenemsNamedException {

		List<Constraint> result = new ArrayList<Constraint>();

		// Get BatteryInverterConstraints
		BatteryInverterConstraint[] constraints = this.getBatteryInverter().getStaticConstraints();

		for (int i = 0; i < constraints.length; i++) {
			BatteryInverterConstraint c = constraints[i];
			result.add(this.getPower().createSimpleConstraint(c.description, this, c.phase, c.pwr, c.relationship,
					c.value));
		}

		// If the GenericEss is not in State "STARTED" block ACTIVE and REACTIVE Power!
		if (!this.isStarted()) {
			result.add(this.createPowerConstraint("ActivePower Constraint ESS not Started", Phase.ALL, Pwr.ACTIVE,
					Relationship.EQUALS, 0));
			result.add(this.createPowerConstraint("ReactivePower Constraint ESS not Started", Phase.ALL, Pwr.REACTIVE,
					Relationship.EQUALS, 0));
		}
		return result.toArray(new Constraint[result.size()]);
	}

	private AtomicReference<StartStop> startStopTarget = new AtomicReference<StartStop>(StartStop.UNDEFINED);

	@Override
	public void setStartStop(StartStop value) {
		if (this.startStopTarget.getAndSet(value) != value) {
			// Set only if value changed
			this.stateMachine.forceNextState(State.UNDEFINED);
		}
	}

	@Override
	public StartStop getStartStopTarget() {
		switch (this.startStopConfig) {
		case AUTO:
			// read StartStop-Channel
			return this.startStopTarget.get();

		case START:
			// force START
			return StartStop.START;

		case STOP:
			// force STOP
			return StartStop.STOP;
		}

		assert false;
		return StartStop.UNDEFINED; // can never happen
	}

	@Override
	public ModbusSlaveTable getModbusSlaveTable(AccessMode accessMode) {
		return new ModbusSlaveTable(//
				OpenemsComponent.getModbusSlaveNatureTable(accessMode), //
				SymmetricEss.getModbusSlaveNatureTable(accessMode), //
				ManagedSymmetricEss.getModbusSlaveNatureTable(accessMode), //
				StartStoppable.getModbusSlaveNatureTable(accessMode), //
				ModbusSlaveNatureTable.of(GenericManagedEss.class, accessMode, 100) //
						.channel(0, GenericManagedEss.ChannelId.STATE_MACHINE, ModbusType.UINT16) //
						.build());

	}
}
