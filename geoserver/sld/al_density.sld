<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor version="1.0.0"
  xmlns="http://www.opengis.net/sld"
  xmlns:ogc="http://www.opengis.net/ogc"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">
  <NamedLayer>
    <Name>al_density</Name>
    <UserStyle>
      <Title>Total de alojamentos por freguesia</Title>
      <FeatureTypeStyle>
        <Rule>
          <Name>0</Name>
          <Title>0 alojamentos</Title>
          <ogc:Filter><ogc:PropertyIsEqualTo><ogc:PropertyName>total_alojamentos</ogc:PropertyName><ogc:Literal>0</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter>
          <PolygonSymbolizer><Fill><CssParameter name="fill">#f7fbff</CssParameter><CssParameter name="fill-opacity">0.55</CssParameter></Fill><Stroke><CssParameter name="stroke">#64748b</CssParameter><CssParameter name="stroke-width">0.5</CssParameter></Stroke></PolygonSymbolizer>
        </Rule>
        <Rule>
          <Name>1-10</Name>
          <Title>1 a 10</Title>
          <ogc:Filter><ogc:And><ogc:PropertyIsGreaterThan><ogc:PropertyName>total_alojamentos</ogc:PropertyName><ogc:Literal>0</ogc:Literal></ogc:PropertyIsGreaterThan><ogc:PropertyIsLessThanOrEqualTo><ogc:PropertyName>total_alojamentos</ogc:PropertyName><ogc:Literal>10</ogc:Literal></ogc:PropertyIsLessThanOrEqualTo></ogc:And></ogc:Filter>
          <PolygonSymbolizer><Fill><CssParameter name="fill">#c6dbef</CssParameter><CssParameter name="fill-opacity">0.65</CssParameter></Fill><Stroke><CssParameter name="stroke">#64748b</CssParameter><CssParameter name="stroke-width">0.5</CssParameter></Stroke></PolygonSymbolizer>
        </Rule>
        <Rule>
          <Name>11-50</Name>
          <Title>11 a 50</Title>
          <ogc:Filter><ogc:And><ogc:PropertyIsGreaterThan><ogc:PropertyName>total_alojamentos</ogc:PropertyName><ogc:Literal>10</ogc:Literal></ogc:PropertyIsGreaterThan><ogc:PropertyIsLessThanOrEqualTo><ogc:PropertyName>total_alojamentos</ogc:PropertyName><ogc:Literal>50</ogc:Literal></ogc:PropertyIsLessThanOrEqualTo></ogc:And></ogc:Filter>
          <PolygonSymbolizer><Fill><CssParameter name="fill">#6baed6</CssParameter><CssParameter name="fill-opacity">0.68</CssParameter></Fill><Stroke><CssParameter name="stroke">#475569</CssParameter><CssParameter name="stroke-width">0.6</CssParameter></Stroke></PolygonSymbolizer>
        </Rule>
        <Rule>
          <Name>51-100</Name>
          <Title>51 a 100</Title>
          <ogc:Filter><ogc:And><ogc:PropertyIsGreaterThan><ogc:PropertyName>total_alojamentos</ogc:PropertyName><ogc:Literal>50</ogc:Literal></ogc:PropertyIsGreaterThan><ogc:PropertyIsLessThanOrEqualTo><ogc:PropertyName>total_alojamentos</ogc:PropertyName><ogc:Literal>100</ogc:Literal></ogc:PropertyIsLessThanOrEqualTo></ogc:And></ogc:Filter>
          <PolygonSymbolizer><Fill><CssParameter name="fill">#2171b5</CssParameter><CssParameter name="fill-opacity">0.7</CssParameter></Fill><Stroke><CssParameter name="stroke">#334155</CssParameter><CssParameter name="stroke-width">0.7</CssParameter></Stroke></PolygonSymbolizer>
        </Rule>
        <Rule>
          <Name>100+</Name>
          <Title>Mais de 100</Title>
          <ogc:Filter><ogc:PropertyIsGreaterThan><ogc:PropertyName>total_alojamentos</ogc:PropertyName><ogc:Literal>100</ogc:Literal></ogc:PropertyIsGreaterThan></ogc:Filter>
          <PolygonSymbolizer><Fill><CssParameter name="fill">#08306b</CssParameter><CssParameter name="fill-opacity">0.74</CssParameter></Fill><Stroke><CssParameter name="stroke">#0f172a</CssParameter><CssParameter name="stroke-width">0.8</CssParameter></Stroke></PolygonSymbolizer>
        </Rule>
      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>
