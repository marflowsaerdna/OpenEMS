import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { FormlyFieldConfig } from '@ngx-formly/core';
import { Service, Utils } from 'src/app/shared/shared';
import { AbstractIbn } from '../../installation-systems/abstract-ibn';

export type AcPv = {
  alias: string,
  value: number,
  orientation: string,
  moduleType: string,
  modulesPerString: number,
  meterType: string,
  modbusCommunicationAddress: number
}

@Component({
  selector: "protocol-additional-ac-producers",
  templateUrl: './protocol-additional-ac-producers.component.html'
})
export class ProtocolAdditionalAcProducersComponent implements OnInit {

  @Input() public ibn: AbstractIbn;
  @Output() public previousViewEvent: EventEmitter<any> = new EventEmitter();
  @Output() public nextViewEvent = new EventEmitter<AbstractIbn>();

  public form: FormGroup;
  public fields: FormlyFieldConfig[];
  public model;
  public insertModeEnabled: boolean;

  constructor(private service: Service) { }

  public ngOnInit() {

    // Initialize PV-Object
    this.ibn.pv ??= {};
    this.ibn.pv.ac ??= [];
    this.form = new FormGroup({});
    this.fields = this.getFields();
    this.model = {};
    this.insertModeEnabled = false;
  }

  public onPreviousClicked() {
    this.previousViewEvent.emit();
  }

  public onNextClicked() {
    if (this.insertModeEnabled) {
      this.service.toast("Speichern Sie zuerst Ihre Eingaben um fortzufahren.", "warning");
      return;
    }

    this.nextViewEvent.emit(this.ibn);
  }

  public getFields(): FormlyFieldConfig[] {

    let fields: FormlyFieldConfig[] = [];

    fields.push({
      key: "alias",
      type: "input",
      templateOptions: {
        label: "Bezeichnung",
        description: "z. B. ''PV Hausdach''",
        required: true
      }
    });

    fields.push({
      key: "value",
      type: "input",
      templateOptions: {
        type: "number",
        label: "Installierte Leistung [Wₚ]",
        min: 1000,
        required: true
      },
      parsers: [Number],
      validators: {
        validation: ["onlyPositiveInteger"]
      }
    });

    fields.push({
      key: "orientation",
      type: "select",
      templateOptions: {
        label: "Ausrichtung",
        options: [
          { label: "Süd", value: "Sued" },
          { label: "Südwest", value: "Suedwest" },
          { label: "West", value: "West" },
          { label: "Südost", value: "Suedost" },
          { label: "Ost", value: "Ost" },
          { label: "Nordwest", value: "Nordwest" },
          { label: "Nordost", value: "Nordost" },
          { label: "Nord", value: "Nord" },
        ]
      }
    });

    fields.push({
      key: "moduleType",
      type: "input",
      templateOptions: {
        label: "Modultyp",
        description: "z. B. Hersteller und Leistung"
      }
    });

    fields.push({
      key: "modulesPerString",
      type: "input",
      templateOptions: {
        type: "number",
        label: "Anzahl PV-Module"
      },
      parsers: [Number],
      validators: {
        validation: ["onlyPositiveInteger"]
      },
      defaultValue: 0
    });

    fields.push({
      key: "meterType",
      type: "select",
      templateOptions: {
        label: "Zählertyp",
        required: true,
        options: [
          { label: "SOCOMEC", value: "socomec" }
        ]
      },
      defaultValue: "socomec"
    });

    fields.push({
      key: "modbusCommunicationAddress",
      type: "input",
      templateOptions: {
        type: "number",
        label: "Modbus Kommunikationsadresse",
        description: "Der Zähler muss mit den folgenden Parametern konfiguriert werden: Kommunikationsgeschwindigkeit (bAud) ''9600'', Kommunikationsparität (PrtY) ''n'', Kommunikations-Stopbit (StoP) ''1''",
        required: true,
        min: 6
      },
      parsers: [Number],
      validators: {
        validation: ["onlyPositiveInteger"]
      },
      defaultValue: 6
    });

    return fields;
  }

  public switchMode() {

    if (this.insertModeEnabled) {

      // Test if form is valid
      if (this.form.invalid) {
        this.service.toast("Geben Sie gültige Daten ein um zu Speichern.", "danger");
        return;
      }

      // Push data into array and reset the form
      this.ibn.pv.ac.push(Utils.deepCopy(this.model));
      this.form.reset();

    }

    // Switch
    this.insertModeEnabled = !this.insertModeEnabled;
  }

  public editElement(element) {
    this.model = element;

    if (!this.insertModeEnabled) {
      this.switchMode();
    }

    this.removeElement(element);
  }

  public removeElement(element) {
    let ac = this.ibn.pv.ac;
    ac.splice(ac.indexOf(element), 1);
  }

  public openManual() {
    window.open('https://docs.fenecon.de/de/_/latest/_attachments/Benutzerhandbuecher/FEMS_App_Socomec_Zaehler_Benutzerhandbuch.pdf');
  }
}