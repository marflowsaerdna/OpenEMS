package io.openems.edge.bridge.modbus.api.worker;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import io.openems.common.exceptions.OpenemsException;
import io.openems.edge.bridge.modbus.api.AbstractModbusBridge;
import io.openems.edge.bridge.modbus.api.AbstractOpenemsModbusComponent;
import io.openems.edge.bridge.modbus.api.element.ModbusElement;
import io.openems.edge.bridge.modbus.api.task.Task;

public abstract class AbstractDummyTask implements Task {

	protected final String name;
	protected final long delay;

	protected boolean isError = false;

	private final Logger log = LoggerFactory.getLogger(AbstractDummyTask.class);

	private AbstractOpenemsModbusComponent parent = null;
	private Runnable onExecuteCallback;

	public AbstractDummyTask(String name, long delay) {
		this.name = name;
		this.delay = delay;
	}

	/**
	 * Callback on Execute.
	 * 
	 * @param onExecuteCallback the callback {@link Runnable}
	 */
	public void onExecute(Runnable onExecuteCallback) {
		this.onExecuteCallback = onExecuteCallback;
	}

	@Override
	public ModbusElement<?>[] getElements() {
		return new ModbusElement[0];
	}

	@Override
	public int getStartAddress() {
		return 0;
	}

	@Override
	public int getLength() {
		return 0;
	}

	@Override
	public void setParent(AbstractOpenemsModbusComponent parent) {
		this.parent = parent;
	}

	@Override
	public AbstractOpenemsModbusComponent getParent() {
		return this.parent;
	}

	@Override
	public void deactivate() {
	}

	@Override
	public <T> int execute(AbstractModbusBridge bridge) throws OpenemsException {
		if (this.onExecuteCallback != null) {
			this.onExecuteCallback.run();
		}

		if (this.isError) {
			try {
				Thread.sleep(this.delay * 10);
			} catch (InterruptedException e) {
				this.log.warn(e.getMessage());
				e.printStackTrace();
			}
			throw new OpenemsException("DummyTask is configured to fail");
		}

		try {
			Thread.sleep(this.delay);
		} catch (InterruptedException e) {
			this.log.warn(e.getMessage());
		}
		return 1;
	}

	public void setError(boolean isError) {
		this.isError = isError;
	}

}