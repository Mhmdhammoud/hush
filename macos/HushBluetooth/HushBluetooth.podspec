Pod::Spec.new do |s|
  s.name         = 'HushBluetooth'
  s.version      = '0.1.0'
  s.summary      = 'RFCOMM bridge to Bose BMAP control channel'
  s.homepage     = 'https://localhost'
  s.license      = 'MIT'
  s.author       = 'Hush'
  s.source       = { :path => '.' }
  s.platforms    = { :osx => '14.0' }
  s.source_files = '*.{swift,m}'
  s.swift_version = '5.0'
  s.frameworks   = 'IOBluetooth'
  s.dependency 'React-Core'
end
