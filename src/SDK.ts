import { getPanelTabName } from './utils'

export interface SDKOptions {
  /**
   * When set to `true`, all logs will be printed to console.
   */
  debug?: boolean

  /**
   * When set to `true`, the extensions will be loaded and executed.
   */
  disabled?: boolean
}

export interface SDKExtension {
  /**
   * A link to the CDN from which to load the extension executable file.
   */
  cdnURL: string

  /**
   * Extension ID.
   */
  id: string
}

export enum event {
  /**
   * The event is triggered when the dashboard loads a new set of analytics data.
   * For example, when user opens dashboard for the first time, changes the data range or time bucket.
   */
  LOAD = 'load',

  /**
   * The event is triggered when user changes the filters.
   */
  FILTERS_UPDATE = 'filtersupdate',

  /**
   * The event is triggered when user changes the time bucket, time perios or sets the date range.
   */
  TIME_UPDATE = 'timeupdate',
}

export enum PanelTab {
  cc = 'cc',
  pg = 'pg',
  lc = 'lc',
  ref = 'ref',
  dv = 'dv',
  br = 'br',
  os = 'os',
  so = 'so',
  me = 'me',
  ca = 'ca',
  lt = 'lt',
}

enum DebugType {
  LOG = 'log',
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
}

type EventsSubObject = {
  [key: string]: (eventData: any) => any
}

type EventsObject = {
  [key in event]?: EventsSubObject
}

type SwetrixCallbacks = {
  onAddExportDataRow: (name: string, onClick: () => void) => void
  onRemoveExportDataRow: (name: string) => void
  onAddPanelTab: (extensionID: string, panelID: string, tabContent: string, onClick: () => void) => void
  onRemovePanelTab: (extensionID: string, panelID: string) => void
}

/**
 * Initialise the SDK instance.
 *
 * @param {string} pid The Project ID to link the instance of Swetrix.js to.
 * @param {SDKOptions} options Options related to the tracking.
 * @returns {SDK} Instance of the Swetrix.js.
 */
export class SDK {
  private events: EventsObject = {}
  private exportDataRowValues: Array<string> = []
  private panelTabValues: Array<string> = []

  /**
   * Initialise the SDK instance.
   * 
   * @param {SDKExtension[]} extensions The extensions to load and execute.
   * @param {SDKOptions} options Swetrix SDK options.
   */
  constructor(private extensions: SDKExtension[], private options?: SDKOptions, private swetrixCallbacks?: SwetrixCallbacks) {
    this._init()
  }

  private _init(): void {
    if (this.options?.disabled) {
      this.debug('SDK is disabled, skipping initialisation')
      return
    }

    this.extensions.forEach(({ cdnURL, id }) => {
      this._loadExtension(cdnURL, id)
    })
  }

  private _loadExtension = (cdnURL: string, id: string): void => {
    fetch(cdnURL)
      // Parse the response as text, return a dummy script if the response is not ok
      .then((res) => {
        if (!res.ok) {
          this.debug(`Error while loading extension from ${cdnURL}`, DebugType.ERROR)
          return '(() => {})'
        }

        return res.text()
      })
      // Execute the extension
      .then(code => {
        eval(code)({
          ...this,

          // Keeping this here as for some reason ...this does not include the methods
          addExportDataRow: this.addExportDataRow,
          debug: this.debug,
          removeExportDataRow: this.removeExportDataRow,

          // Presetting functions which require extension id
          addPanelTab: this.addPanelTab(id),
          removePanelTab: this.removePanelTab(id),
          addEventListener: this.addEventListener(id),
          removeEventListener: this.removeEventListener(id),

          // Functions that should not be exposed to the extensions
          _emitEvent: undefined,
          _destroy: undefined,
          _loadExtension: undefined,
          _init: undefined,
        })
      })
  }

  private debug(message: string, type: DebugType = DebugType.LOG): void {
    if (this.options?.debug) {
      console[type]('[Swetrix SDK]', message)
    }
  }

  public _emitEvent(event: event, eventData: any): void {
    this.debug(`Emitting event '${event}'`)

    if (this.events[event]) {
      // @ts-ignore - TS does not like the fact that we are iterating over an object
      Object.values(this.events[event]).forEach(callback => {
        // Adding a delay before calling events to make sure that the dashboard has time to render
        // in case some callbacks taking a long time to execute
        setTimeout(() => {
          callback(eventData)
        }, 300)
      })
    }
  }

  public _destroy(): void {
    this.debug('Destroying the SDK instance')
    this.events = {}
    this.extensions = []
  }

  // -----------
  // Public methods that are avaliable to the extension developers.
  // -----------

  public addEventListener(extensionID: string): (event: event, callback: (eventData: any) => any) => void {
    /**
     * Add an event listener.
     * 
     * @param {event} event The event to listen to.
     * @param {(eventData: any) => any} callback The callback to execute when the event is triggered.
     * @returns {void}
     */
    return (event: event, callback: (eventData: any) => any) => {
      this.debug(`Adding event listener for ${event} (extension: ${extensionID})`)

      if (typeof callback !== 'function') {
        this.debug(`Callback is not a function (extension: ${extensionID})`, DebugType.ERROR)
        return
      }

      this.events = {
        ...this.events,
        [event]: {
          ...this.events[event],
          [extensionID]: callback,
        },
      }
    }
  }

  public removeEventListener(extensionID: string): (event: event) => void {
    /**
     * Remove an event listener.
     * 
     * @param {event} event The event to remove the listener from.
     * @returns {void}
     */
    return (event: event) => {
      this.debug(`Removing event listener for ${event}`)

      if (this.events[event]) {
        delete this.events[event]?.[extensionID]
      }
    }
  }

  /**
   * Add a new export data row into the dropdown.
   * 
   * @param name The name of the export data row.
   * @param onClick The callback to execute when the export data row is clicked.
   * @returns {void}
   */
  public addExportDataRow(name: string, onClick: () => void): void {
    this.debug(`Adding export data row ${name}`)

    if (this.exportDataRowValues.includes(name)) {
      this.debug(`Export data row ${name} already exists`, DebugType.WARN)
      return
    }

    this.exportDataRowValues.push(name)
    this.swetrixCallbacks?.onAddExportDataRow(name, onClick)
  }

  /**
   * Remove an export data row from the dropdown.
   * 
   * @param name The name of the export data row.
   * @returns {void}
   */
  public removeExportDataRow(name: string): void {
    this.debug(`Removing export data row ${name}`)

    if (!this.exportDataRowValues.includes(name)) {
      this.debug(`Export data row ${name} does not exist`, DebugType.WARN)
      return
    }

    this.exportDataRowValues = this.exportDataRowValues.filter(value => value !== name)
    this.swetrixCallbacks?.onRemoveExportDataRow(name)
  }

  public addPanelTab(extensionID: string): (panelID: PanelTab, tabContent: string, onOpen: () => void) => void {
    /**
     * Add a new panel tab into the dashboard panels.
     * 
     * @param extensionID The ID of the extension.
     * @param panelID The ID of the panel.
     * @param onOpen The callback to execute when the panel tab is opened.
     * @returns {void}
     */
    return (panelID: PanelTab, tabContent: string, onOpen: () => void = () => {}): void => {
      this.debug(`Adding panel tab ${panelID}`)
      const panelName = getPanelTabName(extensionID, panelID)

      if (this.panelTabValues.includes(panelName)) {
        this.debug(`Panel tab ${panelID} (${extensionID}) already exists`, DebugType.WARN)
        return
      }

      this.panelTabValues.push(panelName)
      this.swetrixCallbacks?.onAddPanelTab(extensionID, panelID, tabContent, onOpen)
    }
  }

  public removePanelTab(extensionID: string): (panelID: PanelTab) => void {
    /**
     * Remove a panel tab from the dashboard panels.
     * 
     * @param panelID The ID of the panel.
     * @returns {void}
     */
    return (panelID: PanelTab) => {
      this.debug(`Removing panel tab ${panelID}`)
      const panelName = getPanelTabName(extensionID, panelID)

      if (!this.panelTabValues.includes(panelName)) {
        this.debug(`Panel tab ${panelID} (${extensionID}) does not exist`, DebugType.WARN)
        return
      }

      this.swetrixCallbacks?.onRemovePanelTab(extensionID, panelID)
    }
  }
}
