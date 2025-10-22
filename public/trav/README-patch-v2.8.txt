Patch v2.8 – Synka 'Min kupong' till input-fält/array
- Selektionerna i högerspalten speglas till dolda inputs: #myTicketSync input[name="avd1"...]
- Ett globalt fält exponeras: window.__myTicketArray = ['1 2', '3', ...]
- Fire: 'input' och 'change' på varje hidden input och ett custom event 'myticket:change'
- Försöker även skriva till ev. befintliga textinputs för min kupong (.my-coupon / .min-kupong / #myTicket / .myticket)
- Bygger vidare på funktionerna i v2.7

Installation:
1) Kopiera ui-slider.js till root/public/trav/
2) Ladda den i din HTML före </body>: <script src="ui-slider.js"></script>
