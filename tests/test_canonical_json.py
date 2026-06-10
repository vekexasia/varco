from custom_components.varco.crypto import canonical_json

# Keep this fixture and expected string identical to packages/client/test/canonical-json.test.mjs.
FIXTURE = {
    "Name": "Façade Dashboard",
    "_internal": True,
    "0count": 3,
    "name": "demo",
    "entités": ["sensor.température", {"Z": 1, "a": 2, "_x": None}],
    "zone": {"étage": "1º", "emoji": "😀"},
}

EXPECTED = '{"0count":3,"Name":"Fa\\u00e7ade Dashboard","_internal":true,"entit\\u00e9s":["sensor.temp\\u00e9rature",{"Z":1,"_x":null,"a":2}],"name":"demo","zone":{"emoji":"\\ud83d\\ude00","\\u00e9tage":"1\\u00ba"}}'


def test_canonical_json_matches_typescript_fixture():
    assert canonical_json(FIXTURE) == EXPECTED.encode()
