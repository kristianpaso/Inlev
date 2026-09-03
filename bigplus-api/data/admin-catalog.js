const achievements = [
  { id: "first_bigplus", title: "Första Bigplus", description: "Få din första godkända fisk.", metric: "bigplusCount", target: 1, points: 40, visible: true },
  { id: "species_master", title: "Artmästare", description: "Få Bigplus på fem olika arter.", metric: "speciesCount", target: 5, points: 100, visible: true },
  { id: "pike_owner", title: "Gäddägaren", description: "Få tre gäddor över 100 cm.", metric: "pikeOver100", target: 3, points: 200, visible: true },
  { id: "photo_master", title: "Fotomästare", description: "Registrera 50 fångster med bild eller mätning.", metric: "catchCount", target: 50, points: 150, visible: true },
  { id: "first_fish", title: "Första fisken", description: "Registrera din första fångst.", metric: "catchCount", target: 1, points: 10, visible: true },
  { id: "ten_catches", title: "Tio fångster", description: "Registrera tio fångster.", metric: "catchCount", target: 10, points: 60, visible: true },
  { id: "friend_badge", title: "Vänskapsmärke", description: "Bli vän med en annan fiskare.", metric: "friendCount", target: 1, points: 10, visible: true },
  { id: "hundred_club", title: "100-klubben", description: "Få en Bigplus över 100 cm.", metric: "lengthOver100", target: 1, points: 120, visible: true }
];

module.exports = { achievements };
