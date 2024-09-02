package io.openems.edge.evcs.keba.kecontact.state;

import io.openems.edge.evcs.keba.kecontact.EvcsKebaKeContactImpl;
import io.openems.edge.evcs.api.Phases;

public class RunningThreePhase implements State {
	@Override
	public void handlePower(int power, EvcsKebaKeContactImpl context) {
		if (power < context.getConfiguredMinimumHardwarePower()) {
			context.getPhaseSwitchHandler().setState(context.getSwitchToOnePhaseState());
			context.getPhaseSwitchHandler().switchPhase();
		} else {
			int current = context.calculateCurrent(power, 3);
			context.send("currtime " + current + " 1");
			context.log.info("Running on three Phases with sufficient power:" + power);
		}
	}

	@Override
	public void switchPhase(EvcsKebaKeContactImpl context) {
		context.getPhaseSwitchHandler().handlePhaseSwitch(Phases.ONE_PHASE);
		context.getPhaseSwitchHandler().setState(context.getRunningOnePhaseState());
	}
}
