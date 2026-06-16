<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor version="1.0.0"
  xmlns="http://www.opengis.net/sld"
  xmlns:ogc="http://www.opengis.net/ogc"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">
  <NamedLayer>
    <Name>dem_srtm</Name>
    <UserStyle>
      <Title>Modelo Digital do Terreno</Title>
      <FeatureTypeStyle>
        <Rule>
          <RasterSymbolizer>
            <Opacity>0.65</Opacity>
            <ColorMap type="ramp">
              <ColorMapEntry color="#2b83ba" quantity="0" label="0 m" opacity="1"/>
              <ColorMapEntry color="#abdda4" quantity="100" label="100 m" opacity="1"/>
              <ColorMapEntry color="#ffffbf" quantity="250" label="250 m" opacity="1"/>
              <ColorMapEntry color="#fdae61" quantity="500" label="500 m" opacity="1"/>
              <ColorMapEntry color="#d7191c" quantity="1000" label="1000 m" opacity="1"/>
            </ColorMap>
          </RasterSymbolizer>
        </Rule>
      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>
